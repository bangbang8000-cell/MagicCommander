#!/usr/bin/env python3
"""FastAPI bridge: wraps backend CLI + FS operations to mimic Electron IPC for browser dev."""
import json, os, sys, shutil, subprocess, threading, queue, time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
WORKSPACE_DIR = ROOT_DIR / "workspace"

app = FastAPI(title="MagicCommander Bridge")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# SSE progress relay
_progress_queues: dict[str, queue.Queue] = {}
_progress_lock = threading.Lock()


def _python(*args: str, timeout: int = 120) -> dict:
    """Run main.py with args and return parsed JSON lines."""
    cmd = [sys.executable, str(BACKEND_DIR / "main.py"), *args]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(BACKEND_DIR), timeout=timeout)
    lines = []
    for line in result.stdout.splitlines():
        try:
            lines.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    if result.returncode != 0 and not lines:
        raise HTTPException(500, result.stderr or "Unknown error")
    return {"output": lines, "stderr": result.stderr}


def _python_stream(*args: str, timeout: int = 120) -> dict:
    """Run main.py with args, stream progress lines via global queue, return final output."""
    cmd = [sys.executable, str(BACKEND_DIR / "main.py"), *args]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, cwd=str(BACKEND_DIR))
    lines = []
    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            lines.append(data)
            # Broadcast progress
            with _progress_lock:
                for q in list(_progress_queues.values()):
                    try:
                        q.put_nowait(data)
                    except queue.Full:
                        pass
    finally:
        proc.wait(timeout=timeout)
    return {"output": lines, "stderr": proc.stderr.read() if proc.stderr else ""}


def _scan_projects() -> list:
    """Scan workspace for project directories."""
    if not WORKSPACE_DIR.exists():
        return []
    dirs = sorted(
        d.name for d in WORKSPACE_DIR.iterdir()
        if d.is_dir() and not d.name.startswith(".") and d.name != "__pycache__"
    )
    return [{"id": i + 1, "name": name, "index": i} for i, name in enumerate(dirs)]


def _build_tree(dir_path: Path, base_path: Path) -> list:
    result = []
    try:
        for entry in sorted(dir_path.iterdir()):
            if entry.name.startswith(".") or entry.name == "__pycache__":
                continue
            rel = str(entry.relative_to(base_path))
            if entry.is_dir():
                result.append({"name": entry.name, "path": rel, "isDirectory": True,
                               "children": _build_tree(entry, base_path)})
            else:
                result.append({"name": entry.name, "path": rel, "isDirectory": False})
    except PermissionError:
        pass
    return result


# ── Project APIs ──

@app.post("/api/project:list")
async def project_list():
    return _scan_projects()


class ProjectCreate(BaseModel):
    name: str


@app.post("/api/project:create")
async def project_create(body: ProjectCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "项目名不能为空")
    proj = WORKSPACE_DIR / name
    if proj.exists():
        raise HTTPException(400, "项目已存在")
    (proj / "templates").mkdir(parents=True, exist_ok=True)
    (proj / "excel").mkdir(parents=True, exist_ok=True)
    (proj / "output").mkdir(parents=True, exist_ok=True)
    (proj / "templates" / "main.j2").write_text(
        "{% for item in items %}\n{{ item.name }}\n{% endfor %}\n", encoding="utf-8"
    )
    try:
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sheet1"
        ws.append(["name", "value"])
        ws.append(["sample", "1"])
        wb.save(str(proj / "excel" / "parameters.xlsx"))
    except Exception:
        pass
    return {"ok": True}


class ProjectIds(BaseModel):
    ids: list[str]


@app.post("/api/project:delete")
async def project_delete(body: ProjectIds):
    projects = _scan_projects()
    for id_str in body.ids:
        pid = int(id_str)
        proj = next((p for p in projects if p["id"] == pid), None)
        if proj and (WORKSPACE_DIR / proj["name"]).exists():
            shutil.rmtree(WORKSPACE_DIR / proj["name"])
    return {"ok": True}


class ProjectName(BaseModel):
    name: str


@app.post("/api/project:structure")
async def project_structure(body: ProjectName):
    proj_path = WORKSPACE_DIR / body.name
    if not proj_path.exists():
        return []
    return _build_tree(proj_path, proj_path)


@app.post("/api/project:parameters")
async def project_parameters(body: dict):
    pid = body.get("id", "")
    projects = _scan_projects()
    proj = next((p for p in projects if str(p["id"]) == str(pid)), None)
    if not proj:
        return []
    excel_dir = WORKSPACE_DIR / proj["name"] / "excel"
    if not excel_dir.exists():
        return []
    return [{"file": f.name, "path": f"excel/{f.name}"}
            for f in excel_dir.iterdir() if f.suffix in (".xlsx", ".xls")]


class FileRead(BaseModel):
    id: int
    filePath: str


@app.post("/api/project:readFile")
async def project_read_file(body: FileRead):
    projects = _scan_projects()
    proj = next((p for p in projects if p["id"] == body.id), None)
    if not proj:
        raise HTTPException(404, "项目未找到")
    fp = (WORKSPACE_DIR / proj["name"] / body.filePath).resolve()
    if not str(fp).startswith(str(WORKSPACE_DIR.resolve())):
        raise HTTPException(403, "路径不安全")
    if not fp.exists():
        raise HTTPException(404, "文件不存在")
    return fp.read_text(encoding="utf-8")


class FileWrite(BaseModel):
    id: int
    filePath: str
    content: str


@app.post("/api/project:writeFile")
async def project_write_file(body: FileWrite):
    projects = _scan_projects()
    proj = next((p for p in projects if p["id"] == body.id), None)
    if not proj:
        raise HTTPException(404, "项目未找到")
    fp = (WORKSPACE_DIR / proj["name"] / body.filePath).resolve()
    if not str(fp).startswith(str(WORKSPACE_DIR.resolve())):
        raise HTTPException(403, "路径不安全")
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(body.content, encoding="utf-8")
    return {"ok": True}


# ── Render / Feature APIs (Python backend) ──

@app.post("/api/render:project")
async def render_project(body: ProjectIds):
    return _python_stream("render", "project", ",".join(body.ids))


@app.post("/api/render:yaml")
async def render_yaml(body: ProjectIds):
    return _python_stream("render", "yaml", ",".join(body.ids))


@app.post("/api/render:project-sn")
async def render_project_sn(body: ProjectIds):
    return _python_stream("render", "project-sn", ",".join(body.ids))


@app.post("/api/render:yaml-sn")
async def render_yaml_sn(body: ProjectIds):
    return _python_stream("render", "yaml-sn", ",".join(body.ids))


@app.post("/api/feature:label-print")
async def label_print(body: dict):
    return _python_stream("label", "print", ",".join(body["ids"]))


@app.post("/api/feature:label-delete")
async def label_delete(body: ProjectIds):
    return _python_stream("label", "delete", ",".join(body["ids"]))


@app.post("/api/delete:output")
async def delete_output(body: ProjectIds):
    return _python_stream("file", "delete", "output", ",".join(body["ids"]))


@app.post("/api/delete:output-sn")
async def delete_output_sn(body: ProjectIds):
    return _python_stream("file", "delete", "output-sn", ",".join(body["ids"]))


@app.post("/api/delete:yaml")
async def delete_yaml(body: ProjectIds):
    return _python_stream("file", "delete", "yaml", ",".join(body["ids"]))


@app.post("/api/delete:yaml-sn")
async def delete_yaml_sn(body: ProjectIds):
    return _python_stream("file", "delete", "yaml-sn", ",".join(body["ids"]))


# ── File APIs ──

class FilePath(BaseModel):
    path: str


@app.post("/api/file:read")
async def file_read(body: FilePath):
    fp = Path(body.path)
    if not fp.exists():
        raise HTTPException(404, "文件不存在")
    try:
        return fp.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return fp.read_bytes().decode("gbk", errors="replace")


@app.post("/api/file:exists")
async def file_exists(body: FilePath):
    return Path(body.path).exists()


# ── App APIs ──

@app.post("/api/app:getVersion")
async def app_version():
    return "2.9.6"


@app.post("/api/app:getPath")
async def app_path(body: dict):
    name = body.get("name", "")
    if name == "backend":
        return str(BACKEND_DIR)
    if name == "workspace":
        return str(WORKSPACE_DIR)
    return str(Path.home())


# ── SSE progress stream ──

from fastapi.responses import StreamingResponse
import asyncio


@app.get("/api/progress")
async def progress_stream():
    q: queue.Queue = queue.Queue()
    sid = str(time.time())
    with _progress_lock:
        _progress_queues[sid] = q

    async def gen():
        try:
            while True:
                try:
                    data = await asyncio.to_thread(q.get, timeout=30)
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                except queue.Empty:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            with _progress_lock:
                _progress_queues.pop(sid, None)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/api/health")
async def health():
    return {"status": "ok", "projects": len(_scan_projects())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")
