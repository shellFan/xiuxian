# 牛马修仙传 V10 — MNN 服务健康检查（含真实推理探针）
#
# 用法: powershell -ExecutionPolicy Bypass -File scripts\mnn\health-check.ps1
#   $env:MNN_CHAT_PORT = 7860
#   $env:MNN_HEALTH_FULL = '1'   # 追加一次真实 chat completion 推理探针

$ErrorActionPreference = 'Stop'
$Port = if ($env:MNN_CHAT_PORT) { $env:MNN_CHAT_PORT } else { 7860 }
$Base = "http://127.0.0.1:$Port"

try {
    $health = Invoke-RestMethod -Uri "$Base/health" -TimeoutSec 5
    Write-Host ("health: status={0} ready={1} inferences={2}" -f $health.status, $health.ready, $health.infer_count)
    if (-not $health.ready) { Write-Host 'health: model NOT ready'; exit 1 }
} catch {
    Write-Host "health: FAIL - $($_.Exception.Message)"
    exit 1
}

if ($env:MNN_HEALTH_FULL -eq '1') {
    $body = @{
        model      = 'mnn-pocket-0.3b'
        max_tokens = 48
        messages   = @(
            @{ role = 'system'; content = '你是测试探针，用不超过20字回答。' },
            @{ role = 'user';   content = '一句话介绍你自己。' }
        )
    } | ConvertTo-Json -Depth 5
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $resp = Invoke-RestMethod -Uri "$Base/v1/chat/completions" -Method Post -Body $body `
            -ContentType 'application/json; charset=utf-8' -TimeoutSec 120
        $sw.Stop()
        $text = $resp.choices[0].message.content
        Write-Host ("probe: OK in {0}ms (elapsed_ms={1})" -f $sw.ElapsedMilliseconds, $resp.elapsed_ms)
        Write-Host ("probe: reply = {0}" -f $text)
        if (-not $text) { Write-Host 'probe: empty reply'; exit 1 }
    } catch {
        Write-Host "probe: FAIL - $($_.Exception.Message)"
        exit 1
    }
}
Write-Host 'health-check: PASS'
exit 0
