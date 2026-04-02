param(
    [string]$WsUrl,
    [string]$Token,
    [string]$ScriptsDir
)

# ── Load config from .env if params not provided ────────────────────
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.+?)\s*$') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
        }
    }
}

if (-not $WsUrl)      { $WsUrl      = $env:INVADER_MASTER_WS_URL }
if (-not $Token)       { $Token      = $env:BAR_AGENT_TOKEN }
if (-not $ScriptsDir)  { $ScriptsDir = Join-Path $PSScriptRoot "scripts" }

if (-not $WsUrl -or -not $Token) {
    Write-Host "[agent] ERREUR: INVADER_MASTER_WS_URL et BAR_AGENT_TOKEN requis (via params ou .env)" -ForegroundColor Red
    exit 1
}

$fullUrl = "${WsUrl}?token=${Token}"

# ── Allowed scripts whitelist ────────────────────────────────────────
$allowedScripts = @{}
Get-ChildItem -Path $ScriptsDir -Filter "*.ps1" -ErrorAction SilentlyContinue | ForEach-Object {
    $allowedScripts[$_.BaseName] = $_.FullName
}
Write-Host "[agent] Scripts autorises: $($allowedScripts.Keys -join ', ')" -ForegroundColor Cyan

# ── Execute a command ────────────────────────────────────────────────
function Invoke-AgentCommand {
    param($Id, $Command, $TargetName, $GameName)

    if (-not $allowedScripts.ContainsKey($Command)) {
        return @{ type = "result"; id = $Id; success = $false; output = "Commande inconnue: $Command" }
    }

    $scriptPath = $allowedScripts[$Command]
    Write-Host "[exec] $Command -> $TargetName" -ForegroundColor Yellow

    try {
        $params = @{ TargetName = $TargetName }
        if ($GameName) { $params.GameName = $GameName }

        $output = & $scriptPath @params *>&1 | Out-String
        $output = $output.Trim()
        if (-not $output) { $output = "OK" }

        Write-Host "[exec] Termine. Sortie: $($output.Substring(0, [Math]::Min($output.Length, 200)))" -ForegroundColor Green
        return @{ type = "result"; id = $Id; success = $true; output = $output.Substring(0, [Math]::Min($output.Length, 4000)) }
    }
    catch {
        Write-Host "[exec] Erreur: $_" -ForegroundColor Red
        return @{ type = "result"; id = $Id; success = $false; output = $_.Exception.Message }
    }
}

# ── Force TLS 1.2 (required on older Windows Server) ────────────────
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── WebSocket loop with auto-reconnect ───────────────────────────────
$minDelay = 1
$maxDelay = 30
$delay = $minDelay

while ($true) {
    $ws = $null
    try {
        Write-Host "[ws] Connexion a $WsUrl ..." -ForegroundColor Cyan
        $ws = New-Object System.Net.WebSockets.ClientWebSocket
        $ws.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(30)
        $cts = New-Object System.Threading.CancellationTokenSource

        $connectTask = $ws.ConnectAsync([Uri]$fullUrl, $cts.Token)
        try {
            $connectTask.Wait(15000) | Out-Null
        }
        catch {
            $inner = $_.Exception
            while ($inner.InnerException) { $inner = $inner.InnerException }
            throw "Connexion echouee: $($inner.Message)"
        }

        if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) {
            throw "Connexion echouee (state: $($ws.State))"
        }

        Write-Host "[ws] Connecte!" -ForegroundColor Green
        $delay = $minDelay

        $buffer = New-Object byte[] 65536

        while ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $segment = New-Object System.ArraySegment[byte] $buffer, 0, $buffer.Length

            $recvCts = New-Object System.Threading.CancellationTokenSource
            $recvCts.CancelAfter(60000)

            try {
                $result = $ws.ReceiveAsync($segment, $recvCts.Token)
                $result.Wait() | Out-Null
            }
            catch [System.OperationCanceledException] {
                # Timeout = no message received, loop continues
                continue
            }
            catch {
                if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { break }
                throw
            }
            finally {
                $recvCts.Dispose()
            }

            if ($result.Result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                Write-Host "[ws] Serveur a ferme la connexion" -ForegroundColor Yellow
                break
            }

            $json = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Result.Count)

            try {
                $msg = $json | ConvertFrom-Json
            }
            catch {
                Write-Host "[ws] Message invalide" -ForegroundColor Red
                continue
            }

            # Handle ping
            if ($msg.type -eq "ping") {
                $pong = '{"type":"pong"}'
                $pongBytes = [System.Text.Encoding]::UTF8.GetBytes($pong)
                $pongSegment = New-Object System.ArraySegment[byte] $pongBytes, 0, $pongBytes.Length
                $ws.SendAsync($pongSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait() | Out-Null
                continue
            }

            # Handle execute
            if ($msg.type -eq "execute") {
                Write-Host "[ws] Commande recue: $($msg.command) pour $($msg.params.targetName)" -ForegroundColor Cyan

                $response = Invoke-AgentCommand -Id $msg.id -Command $msg.command -TargetName $msg.params.targetName -GameName $msg.params.gameName

                $responseJson = $response | ConvertTo-Json -Compress -Depth 4
                $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($responseJson)
                $responseSegment = New-Object System.ArraySegment[byte] $responseBytes, 0, $responseBytes.Length
                $ws.SendAsync($responseSegment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait() | Out-Null
            }
        }
    }
    catch {
        Write-Host "[ws] Erreur: $($_.Exception.Message)" -ForegroundColor Red
    }
    finally {
        if ($ws -and $ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            try {
                $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "closing", [System.Threading.CancellationToken]::None).Wait(5000) | Out-Null
            } catch {}
        }
        if ($ws) { $ws.Dispose() }
    }

    Write-Host "[ws] Reconnexion dans ${delay}s..." -ForegroundColor Yellow
    Start-Sleep -Seconds $delay
    $delay = [Math]::Min($delay * 2, $maxDelay)
}
