# 牛马修仙传 V10 — 启动 MNN-Pocket-0.3B 本地推理服务
#
# 用法: powershell -ExecutionPolicy Bypass -File scripts\mnn\start-mnn.ps1
#   $env:MNN_CHAT_PORT = 7860       # 默认 7860, 与 ai-bridge.cjs 一致
#   $env:MNN_INSTALL_DIR = ...      # 与 install-mnn.ps1 相同的自定义目录
#
# 服务绑定 127.0.0.1:PORT；日志写入 <install>\logs\mnn-serve.log；
# PID 写入 <install>\mnn-serve.pid（stop-mnn.ps1 使用）。

$ErrorActionPreference = 'Stop'
$InstallRoot = Join-Path $env:LOCALAPPDATA 'xiuxian-mnn'
if ($env:MNN_INSTALL_DIR) { $InstallRoot = $env:MNN_INSTALL_DIR }
$VenvPython  = Join-Path $InstallRoot 'venv\Scripts\python.exe'
$ModelDir    = Join-Path $InstallRoot 'model'
$LogDir      = Join-Path $InstallRoot 'logs'
$PidFile     = Join-Path $InstallRoot 'mnn-serve.pid'
$LogFile     = Join-Path $LogDir ('mnn-serve-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$Port        = 7860
if ($env:MNN_CHAT_PORT) { $Port = [int]$env:MNN_CHAT_PORT }

if (-not (Test-Path $VenvPython)) { throw "MNN not installed. Run scripts\mnn\install-mnn.ps1 first ($VenvPython missing)." }

# 已经在运行则直接退出（幂等）
if (Test-Path $PidFile) {
    $existing = Get-Process -Id (Get-Content $PidFile) -ErrorAction SilentlyContinue
    if ($existing) { Write-Host "[start] already running (pid $($existing.Id))"; exit 0 }
    Remove-Item $PidFile -Force
}

$serveScript = Join-Path $PSScriptRoot 'mnn-serve.py'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$env:MNN_MODEL_DIR = $ModelDir
$env:MNN_CHAT_PORT = $Port

$proc = Start-Process -FilePath $VenvPython `
    -ArgumentList @($serveScript, '--port', $Port, '--model-dir', $ModelDir) `
    -RedirectStandardOutput $LogFile -RedirectStandardError ($LogFile + '.err') `
    -WindowStyle Hidden -PassThru
Set-Content -Path $PidFile -Value $proc.Id
Write-Host "[start] pid=$($proc.Id) log=$LogFile"

# 等待 /health 就绪（模型加载约 5-30s）
$deadline = (Get-Date).AddSeconds(180)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 800
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
        if ($health.ready) {
            Write-Host "[start] READY on http://127.0.0.1:$Port (model loaded at $($health.loaded_at))"
            exit 0
        }
    } catch { Start-Sleep -Milliseconds 200 }
}
Write-Host "[start] WARN: /health not ready within 180s; check $LogFile"
exit 1
