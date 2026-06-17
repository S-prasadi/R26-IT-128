<#
.SYNOPSIS
  Windows launcher - start every project service.

  Backend  (Node/Express)      http://localhost:8081
  Frontend (Next.js)           http://localhost:3000
  Module A (FastAPI)           http://localhost:8001
  Module B (FastAPI)           http://localhost:8002
  Module C backend (Flask)     http://localhost:8003
  Module C frontend (Vite)     http://localhost:5173
  Module D (FastAPI)           http://localhost:8004

.EXAMPLE
  .\run-all.ps1              # start everything
  .\run-all.ps1 -Install     # force reinstall all deps, then start
  .\run-all.ps1 -NoInstall   # skip dependency checks
#>
param(
    [switch]$Install,
    [switch]$NoInstall
)

$ROOT   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$LOGDIR = Join-Path $ROOT "logs"
New-Item -ItemType Directory -Force -Path $LOGDIR | Out-Null

# --- Locate Python ---
function Find-Python {
    $candidates = @(
        # Anaconda / Miniconda (user)
        "$env:USERPROFILE\anaconda3\python.exe",
        "$env:USERPROFILE\miniconda3\python.exe",
        # Anaconda / Miniconda (system)
        "C:\ProgramData\Anaconda3\python.exe",
        "C:\ProgramData\miniconda3\python.exe",
        # Standard python.org installer (user AppData)
        "$env:LOCALAPPDATA\Python\bin\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
        # Standard python.org installer (system-wide)
        "C:\Python313\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Python310\python.exe",
        "C:\Program Files\Python313\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Program Files\Python311\python.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    # Search PATH, but skip the Windows Store stub (it's not a real interpreter)
    foreach ($n in "py", "python", "python3") {
        $cmd = Get-Command $n -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -notmatch "WindowsApps") { return $cmd.Source }
    }
    throw "Python 3 not found. Install Anaconda or Python from https://python.org and retry."
}

# Modules B, C, D require Python 3.13 — scikit-learn 1.6.1 and pydantic-core have
# no pre-built wheels for Python 3.14 on Windows and must be compiled otherwise.
function Find-Python313 {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "C:\Python313\python.exe",
        "C:\Program Files\Python313\python.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    # Try the py launcher
    try {
        $p = & py -3.13 -c "import sys; print(sys.executable)" 2>$null
        if ($p) { return $p.Trim() }
    } catch {}
    return $null
}

$PYTHON    = Find-Python
$PYTHON313 = Find-Python313
Write-Host "[run-all] Python (default): $PYTHON" -ForegroundColor Green
if ($PYTHON313) {
    Write-Host "[run-all] Python 3.13:      $PYTHON313" -ForegroundColor Green
} else {
    Write-Host "[run-all] WARNING: Python 3.13 not found. Modules B/C/D may fail to install deps." -ForegroundColor Yellow
    Write-Host "[run-all]   Install from https://python.org/downloads and retry." -ForegroundColor Yellow
    $PYTHON313 = $PYTHON   # fall back so the script still runs
}

# --- Install mode ---
$MODE = if ($Install) { "force" } elseif ($NoInstall) { "skip" } else { "auto" }

# --- GITHUB_TOKEN from backend/.env ---
if (-not $env:GITHUB_TOKEN) {
    $envFile = Join-Path $ROOT "backend\.env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^GITHUB_TOKEN=" } | Select-Object -First 1
        if ($line) { $env:GITHUB_TOKEN = ($line -split "=", 2)[1] }
    }
}

# --- Job tracking ---
$JOBS = [System.Collections.Generic.List[System.Management.Automation.Job]]::new()

# --- Helpers ---
function clog($msg, $col = "Cyan") { Write-Host "[run-all] $msg" -ForegroundColor $col }

function Free-Port([int]$port, [string]$name) {
    netstat -ano 2>$null |
        Select-String "TCP\s+[^:]+:$port\s+.*LISTENING" |
        ForEach-Object {
            $id = ($_.ToString().Trim() -split '\s+')[-1]
            if ($id -match '^\d+$' -and [int]$id -ne 0) {
                clog "port $port ($name) busy - stopping PID $id" "Yellow"
                try { Stop-Process -Id ([int]$id) -Force -ErrorAction SilentlyContinue } catch {}
                Start-Sleep -Milliseconds 800
            }
        }
}

function Start-Py([string]$name, [string]$relDir, [string]$venvRel, [string]$script, [int]$port, [string]$pyExeOverride = "") {
    $dir   = Join-Path $ROOT $relDir
    if (-not (Test-Path $dir)) { clog "skip $name - $relDir not found" "Yellow"; return }

    # Use the caller-supplied Python (e.g. 3.13) or fall back to the global default
    $createPy = if ($pyExeOverride) { $pyExeOverride } else { $PYTHON }

    $venv  = Join-Path $dir $venvRel
    $pip   = Join-Path $venv "Scripts\pip.exe"
    $pyExe = Join-Path $venv "Scripts\python.exe"
    $req   = Join-Path $dir  "requirements.txt"
    $flag  = Join-Path $venv ".deps_installed"
    $log   = Join-Path $LOGDIR "$name.log"

    if (-not (Test-Path $venv)) {
        clog "${name}: creating venv with $createPy ..."
        & $createPy -m venv $venv
        $script:MODE = "force"
    }

    if ($script:MODE -eq "force" -or ($script:MODE -eq "auto" -and -not (Test-Path $flag))) {
        if (Test-Path $req) {
            clog "${name}: installing deps (first run may be slow for large packages like torch)..."
            & $pip install -q --upgrade pip
            & $pip install -r $req --timeout 300
            if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Force -Path $flag | Out-Null }
        }
    }

    Free-Port $port $name
    clog "starting $name  ->  http://localhost:$port"

    $tok = $env:GITHUB_TOKEN
    $j = Start-Job -Name $name -ScriptBlock {
        param($exe, $wd, $sc, $lf, $tok)
        if ($tok) { $env:GITHUB_TOKEN = $tok }
        # Force UTF-8 so any Unicode output (e.g. EasyOCR progress bar) doesn't crash on cp1252
        $env:PYTHONUTF8 = "1"
        $env:PYTHONIOENCODING = "utf-8"
        Set-Location $wd
        & $exe $sc *>> $lf
    } -ArgumentList $pyExe, $dir, $script, $log, $tok

    $JOBS.Add($j)
}

function Start-Node([string]$name, [string]$relDir, [int]$port, [string]$cmdStr = "npm run dev") {
    $dir = Join-Path $ROOT $relDir
    if (-not (Test-Path $dir)) { clog "skip $name - $relDir not found" "Yellow"; return }

    if ($MODE -eq "force" -or ($MODE -eq "auto" -and -not (Test-Path (Join-Path $dir "node_modules")))) {
        clog "${name}: npm install..."
        Push-Location $dir; npm install; Pop-Location
    }

    $log = Join-Path $LOGDIR "$name.log"
    Free-Port $port $name
    clog "starting $name  ->  http://localhost:$port"

    $j = Start-Job -Name $name -ScriptBlock {
        param($wd, $cmd, $lf)
        Set-Location $wd
        cmd /c $cmd *>> $lf
    } -ArgumentList $dir, $cmdStr, $log

    $JOBS.Add($j)
}

# --- Launch services ---
Write-Host ""
clog "Launching all services...  (logs -> $LOGDIR\)" "Green"
Write-Host ""

# Python modules first — heavy ML imports need time to warm up.
# Modules B, C, D are pinned to Python 3.13 (scikit-learn 1.6.1 / pydantic-core
# have no pre-built wheels for Python 3.14 on Windows).
Start-Py  "module-a"          "python-module-a"         "venv" "api\app.py"    8001 $PYTHON
Start-Py  "module-b"          "python-module-b"         "venv" "dashboard.py"  8002 $PYTHON313
Start-Py  "module-c-backend"  "python-module-c\backend" "venv" "app.py"        8003 $PYTHON313
Start-Py  "module-d"          "python-module-d"         "venv" "main.py"       8004 $PYTHON313

# Node services
Start-Node "backend"           "backend"                  8081
Start-Node "frontend"          "frontend"                 3000
Start-Node "module-c-frontend" "python-module-c\frontend" 5173 "node node_modules\vite\bin\vite.js"

Write-Host ""
clog "All start commands issued. Services booting up..." "Green"
Write-Host ""
Write-Host "  Service URLs"
Write-Host "  ----------------------------------------"
Write-Host "  Frontend (Next.js)        http://localhost:3000"
Write-Host "  Backend  (Express API)    http://localhost:8081"
Write-Host "  Module A (FastAPI)        http://localhost:8001"
Write-Host "  Module B (FastAPI)        http://localhost:8002"
Write-Host "  Module C backend (Flask)  http://localhost:8003"
Write-Host "  Module C frontend (Vite)  http://localhost:5173"
Write-Host "  Module D (FastAPI)        http://localhost:8004"
Write-Host ""
Write-Host "  Live logs:  Get-Content '$LOGDIR\*.log' -Wait"
Write-Host "  Stop all:   press Ctrl+C"
Write-Host ""

# --- Keep alive + monitor jobs ---
try {
    while ($true) {
        Start-Sleep -Seconds 3
        foreach ($j in @($JOBS)) {
            if ($j.State -eq "Failed") {
                clog "job '$($j.Name)' crashed - check $LOGDIR\$($j.Name).log" "Red"
            }
        }
    }
} finally {
    Write-Host ""
    clog "Shutting down all services..." "Yellow"
    foreach ($j in $JOBS) {
        Stop-Job   $j -ErrorAction SilentlyContinue
        Remove-Job $j -Force -ErrorAction SilentlyContinue
    }
    clog "All services stopped." "Green"
}
