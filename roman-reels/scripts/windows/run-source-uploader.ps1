# One bounded pass of the Roman Reels source uploader over explicit job files.
# Safe to call from Task Scheduler (only while the user is logged on). It does not change power,
# remote-access or sign-in settings. Errors are appended to the local uploader log; no secrets are printed.
param(
  [int]$MaxJobs = 20,
  [int]$TimeoutMinutes = 50
)
$ErrorActionPreference = 'Stop'
$home_ = if ($env:ROMAN_UPLOADER_HOME) { $env:ROMAN_UPLOADER_HOME } else { Join-Path $env:LOCALAPPDATA 'RomanReels\source-uploader' }
New-Item -ItemType Directory -Force -Path $home_ | Out-Null
$errorLog = Join-Path $home_ 'runner-errors.log'
$script = Join-Path $PSScriptRoot '..\run-source-uploader.mjs'
$node = (Get-Command node -ErrorAction Stop).Source
$out = Join-Path $home_ 'last-run.json'
$err = Join-Path $home_ 'last-run.err'
$p = Start-Process -FilePath $node -ArgumentList @("`"$script`"", 'run', '--max', $MaxJobs) -NoNewWindow -PassThru `
  -RedirectStandardOutput $out -RedirectStandardError $err
$null = $p.Handle  # caches the handle so ExitCode is available after WaitForExit(timeout)
if (-not $p.WaitForExit($TimeoutMinutes * 60 * 1000)) {
  $p.Kill()
  Add-Content -Path $errorLog -Encoding utf8 -Value ("{0} timeout after {1} min; run stopped (lock file may need manual check)" -f (Get-Date -Format o), $TimeoutMinutes)
  exit 3
}
if ($p.ExitCode -ne 0) {
  Add-Content -Path $errorLog -Encoding utf8 -Value ("{0} exit {1} (details: last-run.json, uploader-log.jsonl): {2}" -f (Get-Date -Format o), $p.ExitCode, ([string](Get-Content $err -Raw -ErrorAction SilentlyContinue) -replace '\s+', ' '))
}
exit $p.ExitCode
