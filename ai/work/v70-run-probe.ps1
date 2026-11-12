# V7.0 probe: launch electron minimal app on the real desktop session
$env:ELECTRON_RUN_AS_NODE = $null
$env:NODE_OPTIONS = $null
$p = Start-Process -FilePath 'D:\git\fan\xiuxian\desktop\node_modules\electron\dist\electron.exe' `
  -ArgumentList 'D:\git\fan\xiuxian\tmp\v70-min' `
  -Wait -PassThru
Write-Output ('ExitCode=' + $p.ExitCode)
