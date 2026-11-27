<#
.SYNOPSIS
    Aegentix ROG RC73XA Starlink Mini Gen 3 Dish Telemetry Forwarder (PowerShell 5.1 & 7+)
.DESCRIPTION
    Zero-secret-exposure telemetry bridge for ASUSTeK ROG Xbox Ally X (RC73XA / AEG-JARVIS-PRIME).
    1. Auto-discovers STARLINK_TELEMETRY_TOKEN from $env:STARLINK_TELEMETRY_TOKEN or local .env files
       without ever echoing, printing, or logging the secret value.
    2. Verifies https://starlink-edge.aegentixcybernetics.com/health (reporting edge_colo & AS14593 uplink).
    3. Polls local Starlink dish bridge http://127.0.0.1:8790 (/status, /health, POST /mcp) and checks
       dish gRPC socket reachability at 192.168.100.1:9200.
    4. Computes a VES-1 SHA-256 snapshot digest and POSTs JSON telemetry to
       https://starlink-edge.aegentixcybernetics.com/api/starlink/telemetry.
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File .\public\rog-starlink-forwarder.ps1 -Once
.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File .\public\rog-starlink-forwarder.ps1 -Watch -IntervalSeconds 15
#>
[CmdletBinding()]
param(
    [switch]$Once,
    [switch]$Watch,
    [ValidateRange(3, 3600)]
    [int]$IntervalSeconds = 15,
    [string]$EdgeBaseUrl = "https://starlink-edge.aegentixcybernetics.com",
    [string]$LocalBridgeUrl = "http://127.0.0.1:8790",
    [string]$DishGrpcEndpoint = "192.168.100.1:9200",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
    # PowerShell 7+ on Linux/macOS or modern .NET handles TLS 1.2/1.3 automatically
}

function Protect-LogText {
    param(
        [string]$Message,
        [string]$SecretValue
    )
    if ([string]::IsNullOrEmpty($Message)) { return "" }
    if (-not [string]::IsNullOrEmpty($SecretValue) -and $Message.Contains($SecretValue)) {
        return $Message.Replace($SecretValue, "[REDACTED_TOKEN]")
    }
    return $Message
}

function Resolve-StarlinkTelemetryToken {
    if (-not [string]::IsNullOrWhiteSpace($env:STARLINK_TELEMETRY_TOKEN)) {
        return @{
            Found  = $true
            Token  = $env:STARLINK_TELEMETRY_TOKEN.Trim()
            Source = "env:STARLINK_TELEMETRY_TOKEN"
        }
    }

    $candidateDirs = @()
    if ($PSScriptRoot) {
        $candidateDirs += $PSScriptRoot
        $parentDir = Split-Path -Parent $PSScriptRoot
        if ($parentDir) { $candidateDirs += $parentDir }
    }
    $candidateDirs += (Get-Location).Path
    if ($HOME) {
        $candidateDirs += (Join-Path $HOME ".aegentix")
        $candidateDirs += $HOME
    }
    $candidateDirs += "C:\Aegentix"
    $candidateDirs += "C:\Aegentix\starlink"

    $envFileNames = @(".env", ".env.local", ".env.production", "starlink.env")
    $visited = @{}

    foreach ($dir in $candidateDirs) {
        if ([string]::IsNullOrWhiteSpace($dir)) { continue }
        foreach ($fileName in $envFileNames) {
            $fullPath = Join-Path $dir $fileName
            if ($visited.ContainsKey($fullPath)) { continue }
            $visited[$fullPath] = $true

            if (Test-Path -LiteralPath $fullPath -PathType Leaf) {
                $lines = Get-Content -LiteralPath $fullPath -ErrorAction SilentlyContinue
                foreach ($line in $lines) {
                    $trimmed = $line.Trim()
                    if ($trimmed.StartsWith("#") -or [string]::IsNullOrWhiteSpace($trimmed)) {
                        continue
                    }
                    if ($trimmed -match '^(?:export\s+)?STARLINK_TELEMETRY_TOKEN\s*=\s*(.+)$') {
                        $val = $Matches[1].Trim()
                        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
                            $val = $val.Substring(1, $val.Length - 2)
                        }
                        if (-not [string]::IsNullOrWhiteSpace($val)) {
                            return @{
                                Found  = $true
                                Token  = $val
                                Source = "dotenv:$fullPath"
                            }
                        }
                    }
                }
            }
        }
    }

    return @{
        Found  = $false
        Token  = ""
        Source = "none"
    }
}

function Get-StringSha256 {
    param([string]$InputText)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($InputText)
        $hashBytes = $sha.ComputeHash($bytes)
        $sb = New-Object System.Text.StringBuilder
        foreach ($b in $hashBytes) {
            [void]$sb.Append($b.ToString("x2"))
        }
        return $sb.ToString()
    } finally {
        $sha.Dispose()
    }
}

function Test-DishGrpcSocket {
    param([string]$Endpoint)
    $parts = $Endpoint.Split(":")
    $targetHost = $parts[0]
    $targetPort = if ($parts.Length -gt 1) { [int]$parts[1] } else { 9200 }

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($targetHost, $targetPort, $null, $null)
        $connected = $async.AsyncWaitHandle.WaitOne(1200, $false)
        if ($connected -and $client.Connected) {
            $client.EndConnect($async)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Invoke-EdgeHealthCheck {
    param([string]$BaseUrl)
    $healthUri = ($BaseUrl.TrimEnd("/")) + "/health"
    try {
        $resp = Invoke-RestMethod -Uri $healthUri -Method Get -TimeoutSec 8
        $colo = if ($null -ne $resp.edge_colo) { [string]$resp.edge_colo } else { "UNKNOWN" }
        $uplink = if ($null -ne $resp.starlink_uplink_detected) { [bool]$resp.starlink_uplink_detected } else { $false }
        Write-Host ("  [EDGE] {0} -> OK | edge_colo={1} | starlink_uplink_detected={2} (AS14593)" -f $healthUri, $colo, $uplink) -ForegroundColor Cyan
        return @{
            ok                       = $true
            edge_colo                = $colo
            starlink_uplink_detected = $uplink
            service                  = [string]$resp.service
        }
    } catch {
        Write-Host ("  [EDGE] Health check warning ({0}): {1}" -f $healthUri, $_.Exception.Message) -ForegroundColor Yellow
        return @{
            ok                       = $false
            edge_colo                = "UNREACHABLE"
            starlink_uplink_detected = $false
            error                    = $_.Exception.Message
        }
    }
}

function Get-LocalStarlinkSnapshot {
    param(
        [string]$BridgeUrl,
        [string]$GrpcAddr
    )
    $cleanBase = $BridgeUrl.TrimEnd("/")

    # 1. Probe GET /status
    try {
        $statusResp = Invoke-RestMethod -Uri "$cleanBase/status" -Method Get -TimeoutSec 4
        return @{
            source        = "$cleanBase/status"
            bridge_online = $true
            payload       = $statusResp
        }
    } catch {}

    # 2. Probe GET /health
    try {
        $healthResp = Invoke-RestMethod -Uri "$cleanBase/health" -Method Get -TimeoutSec 4
        return @{
            source        = "$cleanBase/health"
            bridge_online = $true
            payload       = $healthResp
        }
    } catch {}

    # 3. Probe MCP JSON-RPC 2.0 POST /mcp
    try {
        $mcpBody = @{
            jsonrpc = "2.0"
            id      = 1
            method  = "tools/call"
            params  = @{
                name      = "starlink_dish_status"
                arguments = @{}
            }
        } | ConvertTo-Json -Depth 6 -Compress

        $mcpResp = Invoke-RestMethod -Uri "$cleanBase/mcp" -Method Post -ContentType "application/json" -Body $mcpBody -TimeoutSec 4
        return @{
            source        = "$cleanBase/mcp"
            bridge_online = $true
            payload       = $mcpResp
        }
    } catch {}

    $grpcReachable = Test-DishGrpcSocket -Endpoint $GrpcAddr
    return @{
        source              = "direct_probe"
        bridge_online       = $false
        dish_grpc_target    = $GrpcAddr
        dish_grpc_reachable = $grpcReachable
        status              = if ($grpcReachable) { "DISH_TCP_9200_REACHABLE_START_8790_BRIDGE" } else { "AWAITING_LOCAL_8790_DISH_BRIDGE" }
    }
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  AEGENTIX STARDUST // ROG RC73XA STARLINK MINI FORWARDER (AS14593)" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan

$tokenInfo = Resolve-StarlinkTelemetryToken
if (-not $tokenInfo.Found -and -not $DryRun) {
    Write-Host "  [ERR] STARLINK_TELEMETRY_TOKEN not found in environment or local .env files." -ForegroundColor Red
    Write-Host "        Set `$env:STARLINK_TELEMETRY_TOKEN or add STARLINK_TELEMETRY_TOKEN=... to .env on RC73XA." -ForegroundColor Yellow
    exit 1
}

if ($tokenInfo.Found) {
    Write-Host ("  [AUTH] Token resolved via {0} (value redacted, zero-secret-exposure active)" -f $tokenInfo.Source) -ForegroundColor Green
} else {
    Write-Host "  [AUTH] DryRun mode active (no live Authorization header will be transmitted)" -ForegroundColor Yellow
}

$runContinuous = $Watch.IsPresent -and (-not $Once.IsPresent)
$ingestUri = ($EdgeBaseUrl.TrimEnd("/")) + "/api/starlink/telemetry"
$cycle = 0

while ($true) {
    $cycle++
    $capturedUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    Write-Host ("`n[CYCLE #{0}] {1}" -f $cycle, $capturedUtc) -ForegroundColor DarkCyan

    $edgePrecheck = Invoke-EdgeHealthCheck -BaseUrl $EdgeBaseUrl
    $dishData = Get-LocalStarlinkSnapshot -BridgeUrl $LocalBridgeUrl -GrpcAddr $DishGrpcEndpoint

    $unsignedBody = @{
        node_identity  = "AEG-JARVIS-PRIME"
        host_model     = "ROG-RC73XA"
        captured_utc   = $capturedUtc
        dish_target    = $DishGrpcEndpoint
        local_bridge   = $LocalBridgeUrl
        edge_precheck  = $edgePrecheck
        dish_telemetry = $dishData
    } | ConvertTo-Json -Depth 10 -Compress

    $ves1Sha256 = Get-StringSha256 -InputText $unsignedBody

    $envelope = @{
        node_identity       = "AEG-JARVIS-PRIME"
        host_model          = "ASUSTeK ROG Xbox Ally X RC73XA"
        expected_asn        = "AS14593"
        captured_utc        = $capturedUtc
        dish_target         = $DishGrpcEndpoint
        local_bridge        = $LocalBridgeUrl
        edge_precheck       = $edgePrecheck
        dish_telemetry      = $dishData
        ves1_payload_sha256 = $ves1Sha256
    } | ConvertTo-Json -Depth 10 -Compress

    if ($DryRun) {
        Write-Host ("  [DRY-RUN] Prepared telemetry snapshot | bridge_online={0} | sha256={1}" -f $dishData.bridge_online, $ves1Sha256.Substring(0, 16)) -ForegroundColor Green
    } else {
        try {
            $headers = @{
                "Authorization" = "Bearer " + $tokenInfo.Token
                "Accept"        = "application/json"
            }
            $postResp = Invoke-RestMethod -Uri $ingestUri -Method Post -Headers $headers -ContentType "application/json" -Body $envelope -TimeoutSec 10
            $ackOk = if ($null -ne $postResp.ok) { $postResp.ok } else { $true }
            Write-Host ("  [PUSH] POST {0} -> ok={1} | bridge={2} | sha256={3}..." -f $ingestUri, $ackOk, $dishData.source, $ves1Sha256.Substring(0, 16)) -ForegroundColor Green
        } catch {
            $safeMsg = Protect-LogText -Message $_.Exception.Message -SecretValue $tokenInfo.Token
            Write-Host ("  [WARN] Telemetry push failed: {0}" -f $safeMsg) -ForegroundColor Yellow
            if (-not $runContinuous) {
                exit 1
            }
        }
    }

    if (-not $runContinuous) {
        break
    }

    Start-Sleep -Seconds $IntervalSeconds
}
