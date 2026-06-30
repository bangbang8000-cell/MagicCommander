#!/usr/bin/env python3
"""
Magic Commander 3 - 命令测试脚本
用于测试所有命令的功能和性能
"""

import subprocess
import sys
import os
import time
from config import WORKSPACE_DIR


def run_command(command, expected_exit_code=0):
    """执行命令并返回结果"""
    try:
        start_time = time.time()
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=60
        )
        execution_time = time.time() - start_time
        
        print(f"执行: {' '.join(command)}")
        print(f"返回码: {result.returncode}")
        print(f"执行时间: {execution_time:.2f}秒")
        
        if result.stdout:
            print("标准输出:")
            print(result.stdout.strip())
            print()
        
        if result.stderr:
            print("错误输出:")
            print(result.stderr.strip())
            print()
        
        if result.returncode != expected_exit_code:
            print(f"警告: 预期返回码 {expected_exit_code}，实际返回码 {result.returncode}")
            print()
        
        return result
    except Exception as e:
        print(f"执行命令时出错: {e}")
        return None


def test_project_commands():
    """测试项目管理命令"""
    print("=" * 50)
    print("测试项目管理命令")
    print("=" * 50)
    print()
    
    # 列出项目
    run_command(['python', 'main.py', 'project', 'list'])
    
    # 测试项目信息
    run_command(['python', 'main.py', 'project', 'info', '1'])
    
    # 测试创建项目
    test_project_name = 'test_' + str(int(time.time()))
    run_command(['python', 'main.py', 'project', 'create', test_project_name])
    
    # 再次列出项目
    run_command(['python', 'main.py', 'project', 'list'])
    
    # 删除测试项目（强制删除）
    run_command(['python', 'main.py', 'project', 'delete', test_project_name, '--force'])
    
    # 再次列出项目
    run_command(['python', 'main.py', 'project', 'list'])
    
    print()


def test_render_commands():
    """测试渲染命令"""
    print("=" * 50)
    print("测试渲染命令")
    print("=" * 50)
    print()
    
    # 测试渲染项目配置
    run_command(['python', 'main.py', 'render', 'project', '1'])
    
    # 测试渲染YAML文件
    run_command(['python', 'main.py', 'render', 'yaml', '1'])
    
    # 测试SN模式渲染
    run_command(['python', 'main.py', 'render', 'project', '1', '--format', 'device_sn'])
    
    print()


def test_label_commands():
    """测试标签命令"""
    print("=" * 50)
    print("测试标签命令")
    print("=" * 50)
    print()
    
    # 测试标签打印
    run_command(['python', 'main.py', 'label', 'print', '1'])
    
    # 测试标签删除
    run_command(['python', 'main.py', 'label', 'delete', '1'])
    
    print()


def test_file_commands():
    """测试文件命令"""
    print("=" * 50)
    print("测试文件命令")
    print("=" * 50)
    print()
    
    # 测试文件删除（强制删除）
    run_command(['python', 'main.py', 'file', 'delete', 'output', '1', '--force'])
    
    # 测试项目文件列表
    run_command(['python', 'main.py', 'file', 'list', '1'])
    
    print()


def test_performance():
    """测试性能"""
    print("=" * 50)
    print("测试性能")
    print("=" * 50)
    print()
    
    # 测试项目创建和删除的性能
    start_time = time.time()
    
    test_project_name = 'perf_test_' + str(int(time.time()))
    result1 = run_command(['python', 'main.py', 'project', 'create', test_project_name])
    
    if result1 and result1.returncode == 0:
        result2 = run_command(['python', 'main.py', 'project', 'delete', test_project_name, '--force'])
    
    total_time = time.time() - start_time
    print(f"项目创建和删除总时间: {total_time:.2f}秒")
    
    print()


def main():
    """主函数"""
    # 检查工作区目录和代码文件是否正确
    if not os.path.exists(os.path.join(WORKSPACE_DIR, 'MC_Para.xlsx')) or not os.path.exists('main.py'):
        print("错误: 请在 backend 目录下运行此脚本，并确保 workspace 目录包含 MC_Para.xlsx")
        sys.exit(1)
    
    print("Magic Commander 3 - 命令测试脚本")
    print("=" * 50)
    print()
    
    # 运行所有测试
    test_project_commands()
    test_render_commands()
    test_label_commands()
    test_file_commands()
    test_performance()
    
    print("=" * 50)
    print("测试完成")
    print("=" * 50)


if __name__ == '__main__':
    main()
