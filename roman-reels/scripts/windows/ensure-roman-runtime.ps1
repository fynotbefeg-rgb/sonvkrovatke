# One supervisor pass: keep the single Telegram poller alive and run one delivery receive/acknowledge pass.
# Intended for Task Scheduler ("only when user is logged on": DPAPI CurrentUser needs the user's session).
# Installs nothing and changes no power, login, firewall, Google or Drive settings. Prints no secrets.
param([switch]$BotDeploymentApproved, [switch]$Receive, [int]$TimeoutMinutes = 10)
$ErrorActionPreference = 'Stop'
$state = Join-Path $env:LOCALAPPDATA 'RomanReels\telegram-panel'
New-Item -ItemType Directory -Force -Path $state | Out-Null
$log = Join-Path $state 'supervisor-log.jsonl'
$script = Join-Path $PSScriptRoot '..\run-windows-supervisor.mjs'
$node = (Get-Command node -ErrorAction Stop).Source
$argv = @("`"$script`"", '--ensure')
if ($BotDeploymentApproved) { $argv += '--bot-deployment-approved' }
if ($Receive) { $argv += '--receive' }
$out = Join-Path $state 'supervisor-last.json'; $err = Join-Path $state 'supervisor-last.err'
$p = Start-Process -FilePath $node -ArgumentList $argv -WorkingDirectory (Join-Path $PSScriptRoot '..\..') -NoNewWindow -PassThru `
  -RedirectStandardOutput $out -RedirectStandardError $err
$null = $p.Handle
if (-not $p.WaitForExit($TimeoutMinutes * 60 * 1000)) { $p.Kill(); Add-Content -Path $log -Encoding utf8 -Value ('{"event":"supervisor_timeout","at":"' + (Get-Date -Format o) + '"}'); exit 3 }
$line = (Get-Content $out -Raw -ErrorAction SilentlyContinue)
if ($line) { Add-Content -Path $log -Encoding utf8 -Value $line.Trim() }
exit $p.ExitCode
