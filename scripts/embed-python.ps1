# embed-python.ps1
# 下载嵌入式 Python 3.11 并安装项目依赖到 resources/python/
# 用于 CI 构建和本地打包

param(
    [string]$PythonVersion = "3.11.9",
    [string]$TargetDir = "resources\python"
)

$ErrorActionPreference = "Stop"
$pythonZip = "python-$PythonVersion-embed-amd64.zip"
$pythonUrl = "https://www.python.org/ftp/python/$PythonVersion/$pythonZip"
$tempZip = "$env:TEMP\$pythonZip"

Write-Host "=== 嵌入式 Python 打包脚本 ==="
Write-Host "Python 版本: $PythonVersion"
Write-Host "目标目录: $TargetDir"

# 1. 清理旧目录
if (Test-Path $TargetDir) {
    Write-Host "清理旧的 Python 目录..."
    Remove-Item -Recurse -Force $TargetDir
}

# 2. 创建目标目录
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

# 3. 下载嵌入式 Python
Write-Host "下载嵌入式 Python: $pythonUrl"
Invoke-WebRequest -Uri $pythonUrl -OutFile $tempZip -UseBasicParsing

# 4. 解压
Write-Host "解压到 $TargetDir..."
Expand-Archive -Path $tempZip -DestinationPath $TargetDir -Force

# 5. 修改 python311._pth 启用 site-packages
$pthFile = Join-Path $TargetDir "python311._pth"
if (Test-Path $pthFile) {
    Write-Host "配置 site-packages..."
    $pthContent = Get-Content $pthFile
    # 取消注释 import site
    $pthContent = $pthContent -replace '#import site', 'import site'
    $pthContent | Set-Content $pthFile -Encoding UTF8
    # 添加 Lib\site-packages 路径
    Add-Content -Path $pthFile -Value 'Lib\site-packages' -Encoding UTF8
}

# 6. 下载并安装 pip
Write-Host "安装 pip..."
$getPipScript = Join-Path $TargetDir "get-pip.py"
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPipScript -UseBasicParsing
$pythonExe = Join-Path $TargetDir "python.exe"
& $pythonExe $getPipScript --no-warn-script-location

# 7. 安装项目依赖
Write-Host "安装 Python 依赖..."
& $pythonExe -m pip install -r backend\requirements.txt --no-warn-script-location

# 8. 清理
Write-Host "清理临时文件..."
Remove-Item $getPipScript -Force -ErrorAction SilentlyContinue
Remove-Item $tempZip -Force -ErrorAction SilentlyContinue

# 9. 验证
Write-Host "验证 Python 环境..."
& $pythonExe -c "import pandas; import jinja2; import openpyxl; import yaml; print('所有依赖安装成功!')"

Write-Host "=== 嵌入式 Python 打包完成 ==="