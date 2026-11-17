# 牛马修仙传 V10 — MNN-Pocket-0.3B 本地部署安装脚本 (Windows)
#
# 安装到独立模型目录（默认 %LOCALAPPDATA%\xiuxian-mnn），绝不打包进游戏 EXE。
# 组件:
#   1. Python venv + 官方 MNN==3.6.2 wheel (PyPI, cp312-win_amd64)
#   2. taobao-mnn/MNN-Pocket-0.3B-MNN INT4 模型 (Apache-2.0) + SHA-256 校验
#
# 用法:  powershell -ExecutionPolicy Bypass -File scripts\mnn\install-mnn.ps1
#        $env:MNN_INSTALL_DIR = 'D:\ai\xiuxian-mnn'  # 可选自定义目录

$ErrorActionPreference = 'Stop'

$InstallRoot = if ($env:MNN_INSTALL_DIR) { $env:MNN_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'xiuxian-mnn' }
$VenvDir     = Join-Path $InstallRoot 'venv'
$ModelDir    = Join-Path $InstallRoot 'model'
$LogDir      = Join-Path $InstallRoot 'logs'

New-Item -ItemType Directory -Force -Path $InstallRoot, $ModelDir, $LogDir | Out-Null
Write-Host "[install] install root: $InstallRoot"

# ── 1. Python venv + MNN wheel ─────────────────────────────────────────────
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) { throw 'Python 3.10+ is required (python not found on PATH).' }

if (-not (Test-Path (Join-Path $VenvDir 'Scripts\python.exe'))) {
    Write-Host '[install] creating venv ...'
    & $python.Source -m venv $VenvDir
}
$venvPython = Join-Path $VenvDir 'Scripts\python.exe'
Write-Host '[install] installing MNN==3.6.2 (official PyPI wheel) ...'
& $venvPython -m pip install --quiet --disable-pip-version-check 'MNN==3.6.2'
& $venvPython -c "from MNN import llm; print('[install] MNN.llm import OK')"

# ── 2. Model download with pinned SHA-256 ─────────────────────────────────
# 校验和来自 HuggingFace LFS oid（即文件 sha256）。任何不匹配都会中止安装。
$Files = @(
    @{ Name = 'llm.mnn.weight'; Sha256 = 'c9e0f2950718c057aeb2c20e5b8dd669cd02477c6c355b46d153256a312a248d' },
    @{ Name = 'llm.mnn';        Sha256 = 'd42a7d9c7152b45b2b6805f9a5ab6dd95c485ad718be88ec723087d4f5d71d7c' },
    @{ Name = 'tokenizer.mtok'; Sha256 = '9f806cad88e8be82e0ca3868903f3528eb1ffcbe4de1437e20549b94fccb4440' },
    @{ Name = 'llm_config.json'; Sha256 = '' },
    @{ Name = 'config.json';     Sha256 = '' },
    @{ Name = 'LICENSE.txt';     Sha256 = '' },
    @{ Name = 'README-cn.md';    Sha256 = '' },
    @{ Name = 'chat_template.jinja'; Sha256 = '' }
)

$Mirrors = @('https://hf-mirror.com', 'https://huggingface.co')
$BaseUrl = '/taobao-mnn/MNN-Pocket-0.3B-MNN/resolve/main'

foreach ($file in $Files) {
    $dest = Join-Path $ModelDir $file.Name
    if ((Test-Path $dest) -and $file.Sha256) {
        $hash = (Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower()
        if ($hash -eq $file.Sha256) { Write-Host "[install] OK (cached+verified) $($file.Name)"; continue }
    }
    if (Test-Path $dest) { Write-Host "[install] present (no pin) $($file.Name)"; continue }
    $done = $false
    foreach ($mirror in $Mirrors) {
        $url = $mirror + $BaseUrl + '/' + $file.Name
        Write-Host "[install] downloading $url"
        try {
            Invoke-WebRequest -Uri $url -OutFile $dest -TimeoutSec 1800 -MaximumRedirection 5
            $done = $true
            break
        } catch {
            Write-Host "[install] mirror failed: $($_.Exception.Message)"
        }
    }
    if (-not $done) { throw "download failed for $($file.Name) (all mirrors)" }
    if ($file.Sha256) {
        $hash = (Get-FileHash -Algorithm SHA256 $dest).Hash.ToLower()
        if ($hash -ne $file.Sha256) { throw "SHA-256 mismatch for $($file.Name): expected $($file.Sha256) got $hash" }
        Write-Host "[install] OK (verified) $($file.Name)"
    }
}

# ── 3. Summary ─────────────────────────────────────────────────────────────
$size = (Get-ChildItem $ModelDir | Measure-Object -Property Length -Sum).Sum
Write-Host ('[install] model dir size: {0:N1} MB' -f ($size / 1MB))
Write-Host "[install] DONE. Start with scripts\mnn\start-mnn.ps1"
