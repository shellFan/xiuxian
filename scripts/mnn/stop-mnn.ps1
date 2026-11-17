# 牛马修仙传 V10 — 停止 MNN 本地推理服务（幂等）
#
# 用法: powershell -ExecutionPolicy Bypass -File scripts\mnn\stop-mnn.ps1

$ErrorActionPreference = 'SilentlyContinue'
$InstallRoot = Join-Path $env:LOCALAPPDATA 'xiuxian-mnn'
if ($env:MNN_INSTALL_DIR) { $InstallRoot = $env:MNN_INSTALL_DIR }
$PidFile = Join-Path $InstallRoot 'mnn-serve.pid'

if (Test-Path $PidFile) {
    $pid = Get-Content $PidFile
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $pid -Force
        Write-Host "[stop] stopped pid $pid"
    } else {
        Write-Host "[stop] pid $pid not running (stale pid file)"
    }
    Remove-Item $PidFile -Force
} else {
    Write-Host '[stop] no pid file; service not started by start-mnn.ps1'
}
exit 0
