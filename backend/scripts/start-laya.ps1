# Starts the local Laya decision server on http://127.0.0.1:8000 (CPU). Keep this window open.
$root = Split-Path -Parent $PSScriptRoot
$env:HF_HOME = Join-Path $root "laya-local\hf-cache"
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
$env:USE_TF = "0"
$env:LAYA_HOST = "127.0.0.1"
$env:LAYA_PORT = "8000"
$env:LAYA_PRELOAD = "1"
# english for replies/intake, multilingual for Hindi/Kannada/Hinglish; typed-decisions isn't used (saves ~1.5 GB RAM)
$env:LAYA_MODELS = "english,multilingual"
$env:PYTHONIOENCODING = "utf-8"
& (Join-Path $root "laya-local\.venv\Scripts\python.exe") -c "from laya.serve import main; main()"
