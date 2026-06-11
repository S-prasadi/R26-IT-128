<#
.SYNOPSIS
  Windows launcher — start every project service.

  Backend  (Node/Express)      http://localhost:8081
  Frontend (Next.js)           http://localhost:3000
  Module A (FastAPI)           http://localhost:8001
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

# ── Locate Python ─────────────────────────────────────────────────────────────
function Find-Python {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    foreach ($name in "py", "python") {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    throw "Python 3 not found. Install from https://python.org and retry."
}
$PYTHON = Find-Python
Write-Host "[run-all] Python: $PYTHON" -ForegroundColor Green

# ── Install mode ──────────────────────────────────────────────────────────────
$MODE = if ($Install) { "force" } elseif ($NoInstall) { "skip" } else { "auto" }

# ── GITHUB_TOKEN from backend/.env ────────────────────────────────────────────
if (-not $env:GITHUB_TOKEN) {
    $envFile = Join-Path $ROOT "backend\.env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^GITHUB_TOKEN=" } | Select-Object -First 1
        if ($line) { $env:GITHUB_TOKEN = ($line -split "=", 2)[1] }
    }
}

# ── Job tracking ──────────────────────────────────────────────────────────────
$JOBS = [System.Collections.Generic.List[System.Management.Automation.Job]]::new()

# ── Helpers ───────────────────────────────────────────────────────────────────
function clog($msg, $col = "Cyan") { Write-Host "[run-all] $msg" -ForegroundColor $col }

function Free-Port([int]$port, [string]$name) {
    netstat -ano 2>$null |
        Select-String "TCP\s+[^:]+:$port\s+.*LISTENING" |
        ForEach-Object {
            $pid = ($_.ToString().Trim() -split '\s+')[-1]
            if ($pid -match '^\d+$' -and [int]$pid -ne 0) {
                clog "port $port ($name) busy — stopping PID $pid" "Yellow"
                try { Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue } catch {}
                Start-Sleep -Milliseconds 800
            }
        }
}

function Start-Py([string]$name, [string]$relDir, [string]$venvRel, [string]$script, [int]$port) {
    $dir   = Join-Path $ROOT $relDir
    if (-not (Test-Path $dir)) { clog "skip $name — $relDir not found" "Yellow"; return }

    $venv  = Join-Path $dir $venvRel
    $pip   = Join-Path $venv "Scripts\pip.exe"
    $pyExe = Join-Path $venv "Scripts\python.exe"
    $req   = Join-Path $dir  "requirements.txt"
    $flag  = Join-Path $venv ".deps_installed"
    $log   = Join-Path $LOGDIR "$name.log"

    if (-not (Test-Path $venv)) {
        clog "${name}: creating venv..."
        & $PYTHON -m venv $venv
        $script:MODE = "force"
    }

    if ($script:MODE -eq "force" -or ($script:MODE -eq "auto" -and -not (Test-Path $flag))) {
        if (Test-Path $req) {
            clog "${name}: installing requirements (first run may be slow)..."
            & $pip install -q --upgrade pip
            & $pip install -r $req
            if ($LASTEXITCODE -eq 0) { New-Item -ItemType File -Force -Path $flag | Out-Null }
        }
    }

    Free-Port $port $name
    clog "starting $name  ->  http://localhost:$port"

    $tok = $env:GITHUB_TOKEN
    $j = Start-Job -Name $name -ScriptBlock {
        param($exe, $wd, $sc, $lf, $tok)
        if ($tok) { $env:GITHUB_TOKEN = $tok }
        Set-Location $wd
        & $exe $sc *>> $lf
    } -ArgumentList $pyExe, $dir, $script, $log, $tok

    $JOBS.Add($j)
}

function Start-Node([string]$name, [string]$relDir, [int]$port, [string]$cmdStr = "npm run dev") {
    $dir = Join-Path $ROOT $relDir
    if (-not (Test-Path $dir)) { clog "skip $name — $relDir not found" "Yellow"; return }

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

# ── Launch services ───────────────────────────────────────────────────────────
Write-Host ""
clog "Launching all services...  (logs -> $LOGDIR\)" "Green"
Write-Host ""

# Python modules first — heavy ML imports need time to warm up
Start-Py  "module-a"          "python-module-a"         "venv" "api\app.py" 8001
Start-Py  "module-c-backend"  "python-module-c\backend" "venv" "app.py"     8003
Start-Py  "module-d"          "python-module-d"         "venv" "main.py"    8004

# Node services
Start-Node "backend"           "backend"                  8081
Start-Node "frontend"          "frontend"                 3000
Start-Node "module-c-frontend" "python-module-c\frontend" 5173 `
           "node node_modules\vite\bin\vite.js"

Write-Host ""
clog "All start commands issued. Services booting up..." "Green"
Write-Host @"

  Service URLs
  ----------------------------------------
  Frontend (Next.js)        http://localhost:3000
  Backend  (Express API)    http://localhost:8081
  Module A (FastAPI)        http://localhost:8001
  Module C backend (Flask)  http://localhost:8003
  Module C frontend (Vite)  http://localhost:5173
  Module D (FastAPI)        http://localhost:8004

  Live logs:  Get-Content "$LOGDIR\*.log" -Wait
  Stop all:   press Ctrl+C in this window

"@

# ── Keep alive + monitor jobs ─────────────────────────────────────────────────
try {
    while ($true) {
        Start-Sleep -Seconds 3
        foreach ($j in @($JOBS)) {
            if ($j.State -eq "Failed") {
                clog "job '$($j.Name)' crashed — check $LOGDIR\$($j.Name).log" "Red"
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
