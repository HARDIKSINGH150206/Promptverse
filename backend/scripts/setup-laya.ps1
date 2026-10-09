# One-time: create a Python venv with CPU PyTorch + the open-source Laya server (Apache 2.0).
# Needs Python 3.10+. Downloads ~1.5 GB of model weights on first start.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root "laya-local\.venv"
$py = (Get-Command py -ErrorAction SilentlyContinue)
if ($py) { & py -3 -m venv $venv } else { & python -m venv $venv }
& "$venv\Scripts\python.exe" -m pip install --upgrade pip
& "$venv\Scripts\python.exe" -m pip install --index-url https://download.pytorch.org/whl/cpu torch
& "$venv\Scripts\python.exe" -m pip install "laya[serve]"
Write-Host "Laya installed. Start it with: npm run laya"
