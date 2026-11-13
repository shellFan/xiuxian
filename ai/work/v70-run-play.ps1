# V7.0 playthrough launcher — starts the real game (desktop harness) on the
# interactive desktop session via Start-Process, with an isolated save dir.
# Parameters (named):
#   -Script   desktop harness file name (e.g. v70-play.cjs)
#   -Phase    before|after
#   -UserData absolute path of isolated XIUXIAN_USER_DATA dir
#   -Head     git head label recorded into results
param(
  [string]$Script = 'v70-play.cjs',
  [string]$Phase = 'before',
  [string]$UserData = 'D:\git\fan\xiuxian\tmp\v70-userdata-before',
  [string]$Head = 'unknown',
  [int]$TimeoutSec = 900
)
$root = 'D:\git\fan\xiuxian'
$env:ELECTRON_RUN_AS_NODE = $null
$env:NODE_OPTIONS = $null
$env:V70_SCRIPT = $Script
$env:V70_PHASE = $Phase
$env:V80_PHASE = $Phase
$env:V70_HEAD = $Head
$env:V80_HEAD = $Head
$env:XIUXIAN_USER_DATA = $UserData
New-Item -ItemType Directory -Force -Path $UserData | Out-Null
$p = Start-Process -FilePath (Join-Path $root 'desktop\node_modules\electron\dist\electron.exe') `
  -ArgumentList (Join-Path $root 'tmp\v70-app') `
  -PassThru
if (-not $p.WaitForExit($TimeoutSec * 1000)) {
  Write-Output ('TIMEOUT after ' + $TimeoutSec + 's — killing process tree')
  taskkill /PID $p.Id /T /F 2>$null | Out-Null
  Write-Output 'KILLED'
} else {
  Write-Output ('ExitCode=' + $p.ExitCode)
}
