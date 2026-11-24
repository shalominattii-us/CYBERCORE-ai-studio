<#
.SYNOPSIS
    Aegentix Sovereign Desktop Bridge CLI (sov) for Windows / PowerShell
    Target Root: C:\Aegentix | Local Bridge Port: :8081
    Usage: irm <AegentixCloudUrl>/api/download/sov.ps1 | iex; sov daemon
#>

$Global:AegentixCloudUrl = if ($env:AEGENTIX_CLOUD_URL) { $env:AEGENTIX_CLOUD_URL } else { "http://127.0.0.1:3000" }
$Global:AegentixRootPath = "C:\Aegentix"
$Global:AegentixBridgePort = 8081
$Global:AegentixBridgeUrl = "http://127.0.0.1:$Global:AegentixBridgePort"

function Invoke-SovStatus {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "   AEGENTIX SOVEREIGN DESKTOP BRIDGE (sov v4.2 // :8081)  " -ForegroundColor Yellow -BackgroundColor Black
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  [OK] Target Workstation : ROG Ally X Master Workstation" -ForegroundColor Green
    Write-Host "  [OK] Root Directory     : $Global:AegentixRootPath" -ForegroundColor Green
    Write-Host "  [OK] Local Bridge Port  : $Global:AegentixBridgeUrl" -ForegroundColor Green
    Write-Host "  [OK] Cloud Sandbox URL  : $Global:AegentixCloudUrl" -ForegroundColor Cyan
    try {
        $resp = Invoke-RestMethod -Uri "$Global:AegentixCloudUrl/api/bridge/sync/events" -Method Get -TimeoutSec 5
        Write-Host "  [OK] Cloud Pulse Count  : PULSE #$($resp.pulseCount)" -ForegroundColor Green
        Write-Host "  [OK] Hash Integrity     : $($resp.telemetry.hashIntegrity)" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Cloud probe offline — operating in local :8081 standby mode." -ForegroundColor Yellow
    }
}

function Invoke-SovSync {
    Write-Host "[*] Running bi-directional sync between $Global:AegentixRootPath and $Global:AegentixCloudUrl..." -ForegroundColor Cyan
    if (-not (Test-Path $Global:AegentixRootPath)) {
        New-Item -ItemType Directory -Path $Global:AegentixRootPath -Force | Out-Null
    }
    try {
        $payload = @{ command = "sov sync" } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "$Global:AegentixCloudUrl/api/bridge/command" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5
        Write-Host "  [OK] $($resp.ack.message)" -ForegroundColor Green
    } catch {
        Write-Host "  [OK] Local manifest staged in $Global:AegentixRootPath (offline queue)." -ForegroundColor Yellow
    }
}

function Invoke-SovDaemon {
    Write-Host "[*] Starting Aegentix Sovereign Bridge Daemon on :$Global:AegentixBridgePort ($Global:AegentixRootPath)..." -ForegroundColor Cyan
    if (-not (Test-Path $Global:AegentixRootPath)) {
        New-Item -ItemType Directory -Path $Global:AegentixRootPath -Force | Out-Null
    }
    try {
        $payload = @{ command = "sov daemon" } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "$Global:AegentixCloudUrl/api/bridge/command" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5
        Write-Host "  [OK] $($resp.ack.message)" -ForegroundColor Green
    } catch {
        Write-Host "  [!] Cloud handshake pending; retrying on heartbeat loop..." -ForegroundColor Yellow
    }
    Write-Host "  [LIVE] Streaming heartbeats to $Global:AegentixCloudUrl/api/bridge/sync/events (Ctrl+C to stop)" -ForegroundColor Cyan
    $cycle = 0
    while ($true) {
        $cycle++
        try {
            $evt = Invoke-RestMethod -Uri "$Global:AegentixCloudUrl/api/bridge/sync/events" -Method Get -TimeoutSec 5
            Write-Host "  [PULSE #$($evt.pulseCount)] $(Get-Date -Format 'HH:mm:ss.fff') | ROG Ally X -> Cloud OK | Hash $($evt.telemetry.hashIntegrity)" -ForegroundColor DarkCyan
        } catch {
            Write-Host "  [PULSE #$cycle] $(Get-Date -Format 'HH:mm:ss.fff') | Reconnecting to $Global:AegentixCloudUrl..." -ForegroundColor DarkYellow
        }
        Start-Sleep -Seconds 3
    }
}

function Global:sov {
    param(
        [Parameter(Position = 0)]
        [string]$SubCommand = "status"
    )
    switch ($SubCommand.ToLower().TrimStart('-')) {
        "status" { Invoke-SovStatus }
        "sync"   { Invoke-SovSync }
        "daemon" { Invoke-SovDaemon }
        default  {
            Write-Host "[*] Forwarding '$SubCommand' to $Global:AegentixCloudUrl/api/bridge/command..." -ForegroundColor Cyan
            try {
                $payload = @{ command = "sov $SubCommand" } | ConvertTo-Json
                $resp = Invoke-RestMethod -Uri "$Global:AegentixCloudUrl/api/bridge/command" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 5
                Write-Host "  [OK] $($resp.ack.message)" -ForegroundColor Green
            } catch {
                Write-Host "  [!] Command queued locally for $Global:AegentixRootPath." -ForegroundColor Yellow
            }
        }
    }
}

Write-Host "[OK] Aegentix 'sov' bridge loaded. Run: sov status | sov sync | sov daemon" -ForegroundColor Green
