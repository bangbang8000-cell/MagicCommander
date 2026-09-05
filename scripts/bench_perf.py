"""MagicCommander 渲染/批量性能门禁（4.0.0-F0-1，对齐 AL scripts/bench_perf.py；4.2.0-42-d 扩 大项目场景）

本地可复现地测量三条关键路径（均在临时 workspace 内，不污染仓库）：
  场景 A —— 批量渲染：N=100 个模板项目（example1 派生，共约 1000 台设备）dry-run 渲染，达标 ≤90s
  场景 B —— 单项目全量渲染（写文件）：example1 完整 render，达标 ≤30s 且产出配置文件
  场景 C —— 大项目参数表数据准备：万行参数表（10k 行）读取 + 写入内存（对齐前端大参数表痛点），达标 ≤30s

注意：后端 config.py 在导入时读取 MC_WORKSPACE，故使用单一临时 workspace 完成所有场景。

用法：
  python scripts/bench_perf.py [--rounds 1] [--projects 100]

输出平均耗时 + 达标判断（FAIL 时退出码 1，供 CI/人工门禁）。
"""
import argparse
import json
import logging
import os
import shutil
import statistics
import sys
import tempfile
import time
from datetime import datetime

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BACKEND = os.path.join(REPO, 'backend')

# 版本（507-a1：基线/对比输出使用）
VERSION = '5.0.7'

# 达标阈值（参考 AL 2048 GPU ≤30s 思路，按 MC 实际规模标定：本地 100 项目实测 16~30s，CI 留 3~5 倍余量）
BATCH_LIMIT_S = 90.0      # N=100 项目批量 dry-run 渲染（≈1000 台设备）
SINGLE_LIMIT_S = 30.0     # 单项目全量渲染（写文件）
LARGE_PARAM_LIMIT_S = 30.0  # 万行参数表数据准备（读取 + 处理，4.2.0-42-d 大项目场景）
# 507-a2：512 项目批量 dry-run 渲染（新增量化「显著下降」场景）。
# 阈值按场景 A 同比例余量标定：场景 A 实测 ≈31s/阈值 90s（≈2.9 倍余量），512 项目实测 ≈178s → 阈值取 240s。
BATCH_512_LIMIT_S = 240.0


class _Bench:
    """单进程单 workspace 基准器：导入一次 backend，两场景共享同一临时 workspace。"""

    def __init__(self, tmpdir):
        self.tmpdir = tmpdir
        os.environ['MC_WORKSPACE'] = tmpdir
        sys.path.insert(0, BACKEND)
        logging.getLogger('magiccommander').setLevel(logging.ERROR)

    def _register(self, project_names):
        import pandas as pd
        pd.DataFrame({'项目名称': project_names}).to_excel(
            os.path.join(self.tmpdir, 'MC_Para.xlsx'), sheet_name='项目名称', index=False, header=True)

    def _last_json(self, output):
        last = None
        for line in output.splitlines():
            line = line.strip()
            if line.startswith('{'):
                try:
                    last = json.loads(line)
                except (ValueError, TypeError):
                    continue
        return last

    def batch_dry_run(self, project_names):
        """批量 dry-run 渲染，返回 (耗时秒, 设备数)。"""
        import io
        import contextlib
        from pre_processing import PreProcessing
        logging.getLogger().setLevel(logging.ERROR)  # 屏蔽后端 INFO（pre_processing 日志器）

        base = os.path.join(REPO, 'example', 'example1')
        # 507-a2：清理共享 workspace 中既有 bench 目录（场景 C 的 bench_large 等），保证本批量测量干净自洽
        for entry in os.listdir(self.tmpdir):
            if entry.startswith(('bench_', 'bench512_', 'bench_single')):
                shutil.rmtree(os.path.join(self.tmpdir, entry), ignore_errors=True)
        for name in project_names:
            shutil.copytree(base, os.path.join(self.tmpdir, name))
        self._register(project_names)

        p = PreProcessing()
        p.read_MC_para('MC_Para.xlsx')
        buf = io.StringIO()
        t0 = time.perf_counter()
        with contextlib.redirect_stdout(buf):
            p.execute_dry_run('all', 'device_name')
        elapsed = time.perf_counter() - t0

        last = self._last_json(buf.getvalue())
        if not last or last.get('status') != 'complete':
            raise RuntimeError(f'批量渲染未完成: {str(last)[:300]}')
        devices = len((last.get('data') or {}).get('results') or [])
        return elapsed, devices

    def single_full_render(self, project_name):
        """单项目全量渲染（写文件到临时 workspace output/），返回 (耗时秒, 输出配置数)。"""
        import io
        import contextlib
        from pre_processing import PreProcessing
        logging.getLogger().setLevel(logging.ERROR)  # 屏蔽后端 INFO（pre_processing 日志器）

        shutil.copytree(os.path.join(REPO, 'example', 'example1'), os.path.join(self.tmpdir, project_name))
        self._register([project_name])

        p = PreProcessing()
        p.read_MC_para('MC_Para.xlsx')
        buf = io.StringIO()
        t0 = time.perf_counter()
        with contextlib.redirect_stdout(buf):
            p.execute_render('1', 'device_name')
        elapsed = time.perf_counter() - t0

        output_dir = os.path.join(self.tmpdir, project_name, 'output')
        if not os.path.isdir(output_dir):
            raise RuntimeError('渲染后无 output 目录')
        latest = sorted(os.listdir(output_dir))[-1]
        base_dir = os.path.join(output_dir, latest)
        txts = 0
        for _, _, files in os.walk(base_dir):
            txts += sum(1 for f in files if f.endswith('.txt'))
        return elapsed, txts

    def large_param_prep(self, rows: int = 10_000):
        """场景 C：万行参数表数据准备 —— 生成 rows 行参数表并写入内存，返回 (耗时秒, 写入参数数)。"""
        import pandas as pd
        from base import Base

        project_dir = os.path.join(self.tmpdir, 'bench_large')
        excel_dir = os.path.join(project_dir, 'excel')
        os.makedirs(excel_dir, exist_ok=True)
        df = pd.DataFrame({
            '全局参数名称': [f'PARAM_{i:05d}' for i in range(rows)],
            '参数值': [f'value_{i}' for i in range(rows)],
        })
        df.to_excel(os.path.join(excel_dir, 'parameter.xlsx'), sheet_name='参数表', index=False)

        ba = Base(self.tmpdir)
        ba.devices = {'bench-dev': {'设备名': 'bench-dev'}}
        t0 = time.perf_counter()
        ba.read_para('parameter.xlsx', '参数表', 'excel', 'bench_large')
        elapsed = time.perf_counter() - t0
        # devices['bench-dev'] 内除 '设备名' 外即为参数表键值
        written = len(ba.devices['bench-dev']) - 1
        return elapsed, written


def main():
    parser = argparse.ArgumentParser(description='MagicCommander 渲染/批量性能基准')
    parser.add_argument('--rounds', type=int, default=1, help='每场景重复次数（默认 1）')
    parser.add_argument('--projects', type=int, default=100, help='批量场景项目数（默认 100）')
    parser.add_argument('--json', metavar='PATH', help='输出规范化基准报告到 JSON 文件（507-a1）')
    parser.add_argument('--compare', metavar='PREV_JSON', help='与指定基线 JSON 对比，输出 delta/PASS/REGRESS（507-a1）')
    args = parser.parse_args()

    print('===== MagicCommander 性能基准（4.0.0 / 4.2.0 大项目场景 / 5.0.7 基线）=====')
    tmpdir = tempfile.mkdtemp(prefix='mc_bench_')
    scenarios = []
    try:
        bench = _Bench(tmpdir)
        project_names = [f'bench_{i}' for i in range(args.projects)]

        # 场景 A：批量渲染（dry-run）
        samples_a, devices = [], 0
        for _ in range(args.rounds):
            el, dev = bench.batch_dry_run(project_names)
            samples_a.append(el)
            devices = dev
        avg_a = statistics.mean(samples_a)
        ok_a = avg_a <= BATCH_LIMIT_S and devices >= args.projects
        print(f'[场景A] 批量渲染（{args.projects} 个项目 ≈ {devices} 台设备，rounds={args.rounds}）  达标阈值 ≤{BATCH_LIMIT_S}s')
        print(f'  耗时     avg={avg_a:.2f} min={min(samples_a):.2f} max={max(samples_a):.2f} s')
        print(f'  设备数   {devices}')
        print(f"  结果: {'PASS' if ok_a else 'FAIL'}")
        print()
        scenarios.append(_scenario('batch-dry-run', f'批量渲染 {args.projects} 项目', avg_a,
                                  BATCH_LIMIT_S, min(samples_a), max(samples_a), ok_a))

        # 场景 B：单项目全量渲染（写文件）
        samples_b, txts = [], 0
        for _ in range(args.rounds):
            el, n = bench.single_full_render('bench_single')
            samples_b.append(el)
            txts = n
        avg_b = statistics.mean(samples_b)
        ok_b = avg_b <= SINGLE_LIMIT_S and txts >= 1
        print(f'[场景B] 单项目全量渲染（写文件，rounds={args.rounds}）  达标阈值 ≤{SINGLE_LIMIT_S}s')
        print(f'  耗时     avg={avg_b:.2f} min={min(samples_b):.2f} max={max(samples_b):.2f} s')
        print(f'  输出配置 {txts} 个 .txt')
        print(f"  结果: {'PASS' if ok_b else 'FAIL'}")
        print()
        scenarios.append(_scenario('single-render', '单项目全量渲染', avg_b,
                                  SINGLE_LIMIT_S, min(samples_b), max(samples_b), ok_b))

        # 场景 C：大项目参数表数据准备（万行参数，4.2.0-42-d）
        samples_c, written = [], 0
        for _ in range(args.rounds):
            el, w = bench.large_param_prep()
            samples_c.append(el)
            written = w
        avg_c = statistics.mean(samples_c)
        ok_c = avg_c <= LARGE_PARAM_LIMIT_S and written >= 10_000
        print(f'[场景C] 万行参数表数据准备（10k 行，rounds={args.rounds}）  达标阈值 ≤{LARGE_PARAM_LIMIT_S}s')
        print(f'  耗时     avg={avg_c:.2f} min={min(samples_c):.2f} max={max(samples_c):.2f} s')
        print(f'  参数写入 {written} 条')
        print(f"  结果: {'PASS' if ok_c else 'FAIL'}")
        print()
        scenarios.append(_scenario('large-param', '万行参数表数据准备', avg_c,
                                  LARGE_PARAM_LIMIT_S, min(samples_c), max(samples_c), ok_c))

        # 场景 D（507-a2）：512 项目批量 dry-run 渲染（量化「显著下降」）
        projects_512 = [f'bench512_{i}' for i in range(512)]
        samples_d, devices_d = [], 0
        for _ in range(args.rounds):
            el, dev = bench.batch_dry_run(projects_512)
            samples_d.append(el)
            devices_d = dev
        avg_d = statistics.mean(samples_d)
        ok_d = avg_d <= BATCH_512_LIMIT_S and devices_d >= 512
        print(f'[场景D] 512 项目批量渲染（512 个项目 ≈ {devices_d} 台设备，rounds={args.rounds}）  达标阈值 ≤{BATCH_512_LIMIT_S}s')
        print(f'  耗时     avg={avg_d:.2f} min={min(samples_d):.2f} max={max(samples_d):.2f} s')
        print(f"  结果: {'PASS' if ok_d else 'FAIL'}")
        print()
        scenarios.append(_scenario('batch-512', '512 项目批量渲染', avg_d,
                                  BATCH_512_LIMIT_S, min(samples_d), max(samples_d), ok_d))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    ok_all = ok_a and ok_b and ok_c and ok_d

    report = {
        'tool': 'MagicCommander bench_perf',
        'version': VERSION,
        'env': {'python': sys.version.split()[0], 'ts': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
                'baseline': os.path.basename(args.compare) if args.compare else 'n/a'},
        'scenarios': scenarios,
    }
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f'=> 基准报告已写入: {args.json}')
    if args.compare:
        _compare_report(args.compare, scenarios)
        print()

    if ok_all:
        print('===== 全部达标 =====')
        return 0
    print('===== 存在未达标项（需关键路径优化）=====')
    return 1


def _scenario(name, label, avg_s, threshold_s, min_s, max_s, ok):
    return {
        'name': name,
        'label': label,
        'threshold_s': threshold_s,
        'avg_s': round(avg_s, 3),
        'min_s': round(min_s, 3),
        'max_s': round(max_s, 3),
        'unit': 's',
        'pass': bool(ok),
    }


def _compare_report(prev_path, scenarios):
    """与基线 JSON 对比：逐场景 delta% 与 PASS(下降)/REGRESS(上升)。"""
    if not os.path.exists(prev_path):
        print(f'!! 基线文件不存在: {prev_path}')
        return
    with open(prev_path, 'r', encoding='utf-8') as f:
        prev = json.load(f)
    prev_map = {s['name']: s for s in prev.get('scenarios', [])}
    print('===== 与基线对比（507-a1） =====')
    print(f'  基线: {prev.get("tool")} v{prev.get("version")} @ {prev.get("env", {}).get("baseline", "?")}')
    for sc in scenarios:
        p = prev_map.get(sc['name'])
        if not p:
            print(f'  - {sc["label"]}: 基线无此场景（新增）')
            continue
        delta = (sc['avg_s'] - p['avg_s']) / p['avg_s'] * 100 if p['avg_s'] else 0.0
        verdict = 'PASS(下降)' if delta < 0 else ('REGRESS(上升)' if delta > 0 else 'SAME')
        print(f'  - {sc["label"]}: {p["avg_s"]:.2f}s -> {sc["avg_s"]:.2f}s  delta {delta:+.1f}%  {verdict}')


if __name__ == '__main__':
    sys.exit(main())
