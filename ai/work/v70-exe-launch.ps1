# V7.0 packaged-EXE launcher: starts the real EXE with CDP + isolated save.
# The dist folder name contains CJK chars, so locate the exe by wildcard
# (avoids script-encoding issues across PowerShell 5.1 codepages).
#   -Launch                       start the EXE (returns PID)
#   -GracefulClose -Pid2 <pid>    send WM_CLOSE (player-quit path, save flush)
param(
  [switch]$Launch,
  [switch]$GracefulClose,
  [int]$Pid2 = 0,
  [string]$UserData = 'D:\git\fan\xiuxian\tmp\v70-exe-userdata',
  [int]$Port = 9224
)
$root = 'D:\git\fan\xiuxian'
$distRoot = Join-Path $root 'dist'
$exe = Get-ChildItem -Path $distRoot -Filter '*.exe' -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notmatch 'uninstall|Uninstall' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1
if (-not $exe) { Write-Output 'EXE_NOT_FOUND'; exit 1 }
if ($Launch) {
  $env:ELECTRON_RUN_AS_NODE = $null
  $env:NODE_OPTIONS = $null
  $env:XIUXIAN_USER_DATA = $UserData
  New-Item -ItemType Directory -Force -Path $UserData | Out-Null
  $p = Start-Process -FilePath $exe.FullName `
    -ArgumentList ('--remote-debugging-port=' + $Port) `
    -PassThru
  Write-Output ('LAUNCHED pid=' + $p.Id + ' exe=' + $exe.FullName)
  $p.Id | Set-Content (Join-Path $root 'tmp\v70-exe.pid')
} elseif ($GracefulClose) {
  if ($Pid2 -gt 0) {
    taskkill /PID $Pid2 2>$null | Out-Null
    Start-Sleep -Seconds 6
    $alive = Get-Process -Id $Pid2 -ErrorAction SilentlyContinue
    if ($alive) { Write-Output 'STILL_ALIVE'; taskkill /PID $Pid2 /T /F 2>$null | Out-Null; Write-Output 'FORCE_KILLED' }
    else { Write-Output 'CLOSED_GRACEFULLY' }
  } else { Write-Output 'NO_PID' }
}
