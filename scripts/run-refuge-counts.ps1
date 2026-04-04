# HuntStack - Weekly Refuge Counts Scraper
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

Write-Log "Running: python -m huntstack_scrapers.scrapers.run refuge_counts"
$output = & C:\Python313\python.exe -m huntstack_scrapers.scrapers.run refuge_counts 2>&1

# Log all output
$output | ForEach-Object { Write-Log $_ }

$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Log "=== Scraper completed successfully (exit 0) ==="
} else {
    Write-Log "=== Scraper FAILED (exit $exitCode) ==="
}

# Prune logs older than 30 days
Get-ChildItem $LogDir -Filter "refuge-counts-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force

exit $exitCode
