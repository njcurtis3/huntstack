# HuntStack - Weekly data pipeline run (file name kept so the scheduled task needn't change)
# Scheduled: Every Monday at 6:00 AM local time

$RepoRoot = "C:\Users\natha\Desktop\repos\huntstack"
$ScraperDir = "$RepoRoot\apps\scrapers-python"
$LogDir = "$RepoRoot\scripts\logs"
$LogFile = "$LogDir\refuge-counts-$(Get-Date -Format 'yyyy-MM-dd').log"

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

# Send a failure alert to an optional webhook (Slack or Discord). No-ops if SCRAPER_ALERT_WEBHOOK
# is not set, so this is safe until a webhook URL is configured. Without it, a scraper that stops
# running (machine off, task disabled) or silently produces no data fails invisibly â€” the whole
# point of this alert. Payload carries both "text" (Slack) and "content" (Discord) so one webhook
# URL works for either service.
function Send-Alert {
    param([string]$Message)
    $webhook = [System.Environment]::GetEnvironmentVariable('SCRAPER_ALERT_WEBHOOK', 'Process')
    if (-not $webhook) {
        Write-Log "SCRAPER_ALERT_WEBHOOK not set â€” skipping alert: $Message"
        return
    }
    try {
        $payload = @{ text = $Message; content = $Message } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri $webhook -Method Post -Body $payload -ContentType 'application/json' -TimeoutSec 20 | Out-Null
        Write-Log "Alert sent to webhook"
    } catch {
        Write-Log "WARNING: failed to send alert: $($_.Exception.Message)"
    }
}

Write-Log "=== HuntStack Refuge Counts Scraper Started ==="
Write-Log "Log: $LogFile"

# Load .env from repo root
$EnvFile = "$RepoRoot\.env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.+)$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
    Write-Log "Loaded .env from $EnvFile"
} else {
    Write-Log "WARNING: .env not found at $EnvFile"
}

# Run scraper from its directory (required for module resolution)
Set-Location $ScraperDir

# Since 2026-10-27 this runs the data pipeline, not just the refuge counts: every job that is
# due (weekly counts in season, monthly regulation pages, ...). The pipeline checks each job's
# result, records it in pipeline_runs and posts warnings/failures to SCRAPER_ALERT_WEBHOOK
# itself, so this script only alerts when the pipeline crashed before printing its summary.
Write-Log "Running: python -m huntstack_scrapers.pipeline update all"
$output = & C:\Python313\python.exe -m huntstack_scrapers.pipeline update all 2>&1

# Log all output
$output | ForEach-Object { Write-Log $_ }

$exitCode = $LASTEXITCODE
$outputText = ($output | Out-String)
$summarized = $outputText -match '"pipeline":\s*"update"'

if (-not $summarized) {
    Write-Log "=== Pipeline CRASHED (exit $exitCode, no summary) ==="
    Send-Alert "[HuntStack] Data pipeline crashed (exit $exitCode) on $(Get-Date -Format 'yyyy-MM-dd'). See $LogFile"
} elseif ($exitCode -ne 0) {
    Write-Log "=== Pipeline finished with failed jobs (already alerted) ==="
} else {
    Write-Log "=== Pipeline completed (exit 0) ==="
}

# Prune logs older than 30 days
Get-ChildItem $LogDir -Filter "refuge-counts-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

exit $exitCode
