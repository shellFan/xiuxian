# 解除 ZCode checkpoints 目录锁定(恢复 checkpoint 回滚/时间线功能)
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File unlock-checkpoints.ps1
$p = "$env:USERPROFILE\.zcode\v2\checkpoints"
if (-not (Test-Path $p)) { Write-Output "目录不存在: $p"; exit 1 }
$acl = Get-Acl $p
$acl.Access | Where-Object { $_.AccessControlType -eq 'Deny' } | ForEach-Object { [void]$acl.RemoveAccessRuleSpecific($_) }
Set-Acl $p $acl
Write-Output "已移除 Deny 规则,checkpoints 目录恢复正常读写。"
(Get-Acl $p).Access | Format-Table IdentityReference, AccessControlType, FileSystemRights -AutoSize
