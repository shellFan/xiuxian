$root = 'D:\git\fan\xiuxian'
$env:ELECTRON_RUN_AS_NODE = $null
$env:NODE_OPTIONS = $null
$env:XIUXIAN_USER_DATA = 'D:\git\fan\xiuxian\tmp\v70-exe-userdata'
$exe = Get-ChildItem -Path (Join-Path $root 'dist') -Filter '*.exe' -Recurse | Where-Object { $_.Name -notmatch 'uninstall|Uninstall' } | Sort-Object FullName -Descending | Select-Object -First 1
$p = Start-Process -FilePath $exe.FullName -ArgumentList '--remote-debugging-port=9225' -PassThru
Write-Output ('RELAUNCHED pid=' + $p.Id)
$p.Id | Set-Content (Join-Path $root 'tmp\v70-exe.pid')
