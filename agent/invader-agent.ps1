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

# ── Sous-systeme lumieres Hue ────────────────────────────────────────
# Le worker tourne dans un RUNSPACE SEPARE : la boucle WebSocket ci-dessous est
# mono-thread, une animation de 12 s executee dedans gelerait la socket.
# Ici on se contente d'empiler le cue (O(1)) et on repart en ReceiveAsync.
$script:HueEnabled = ($env:HUE_ENABLED -eq 'true')
$script:HueQueue   = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$script:HueLog     = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$script:HueState   = [hashtable]::Synchronized(@{
    heartbeat = [DateTime]::UtcNow; bridgeHealthy = $true; lastCueName = $null
    lastCueAt = $null; sent60s = 0; errors60s = 0; dropped60s = 0; queueDepth = 0
})
$script:HueWorker  = $null

function Start-HueWorker {
    if (-not $script:HueEnabled) { return }
    $hueRoot = Join-Path $PSScriptRoot 'hue'
    $workerPath = Join-Path $hueRoot 'hue-worker.ps1'
    if (-not (Test-Path $workerPath)) {
        Write-Host "[hue] hue-worker.ps1 introuvable, lumieres desactivees" -ForegroundColor Yellow
        $script:HueEnabled = $false
        return
    }
    $config = @{
        BridgeIp = $env:HUE_BRIDGE_IP; ApiKey = $env:HUE_API_KEY
        DryRun = ($env:HUE_DRY_RUN -eq 'true')
        HueRoot = $hueRoot; AgentRoot = $PSScriptRoot
        RateGlobal = $(if ($env:HUE_RATE_GLOBAL) { $env:HUE_RATE_GLOBAL } else { 8 })
        MinIntervalMs = $(if ($env:HUE_MIN_INTERVAL_MS) { $env:HUE_MIN_INTERVAL_MS } else { 250 })
    }
    try {
        $rs = [runspacefactory]::CreateRunspace(); $rs.Open()
        $rs.SessionStateProxy.SetVariable('HueQueue',  $script:HueQueue)
        $rs.SessionStateProxy.SetVariable('HueLog',    $script:HueLog)
        $rs.SessionStateProxy.SetVariable('HueState',  $script:HueState)
        $rs.SessionStateProxy.SetVariable('HueConfig', $config)
        $ps = [powershell]::Create(); $ps.Runspace = $rs
        $ps.AddScript((Get-Content $workerPath -Raw)) | Out-Null
        $script:HueWorker = @{ ps = $ps; rs = $rs; handle = $ps.BeginInvoke() }
        Write-Host "[hue] Worker demarre (bridge=$($config.BridgeIp) dryRun=$($config.DryRun))" -ForegroundColor Cyan
    } catch {
        Write-Host "[hue] Echec du demarrage du worker: $($_.Exception.Message)" -ForegroundColor Red
        $script:HueEnabled = $false
    }
}

# Un crash de runspace est SILENCIEUX par nature (erreurs avalees dans
# $ps.Streams.Error) : on surveille le heartbeat et on relance.
function Test-HueWorkerHealth {
    if (-not $script:HueEnabled -or -not $script:HueWorker) { return }
    $dead = $script:HueWorker.handle.IsCompleted
    $stale = ((([DateTime]::UtcNow) - $script:HueState.heartbeat).TotalSeconds -gt 15)
    if ($dead -or $stale) {
        Write-Host "[hue] Worker inactif (termine=$dead, heartbeat en retard=$stale), relance" -ForegroundColor Yellow
        foreach ($e in $script:HueWorker.ps.Streams.Error) { Write-Host "[hue] $e" -ForegroundColor Red }
        try { $script:HueWorker.ps.Stop(); $script:HueWorker.ps.Dispose(); $script:HueWorker.rs.Dispose() } catch {}
        $script:HueWorker = $null
        $script:HueState.heartbeat = [DateTime]::UtcNow
        Start-HueWorker
    }
}

# Write-Host depuis un runspace ne remonte pas a la console : on draine la file.
function Write-HueWorkerLogs {
    $line = $null
    while ($script:HueLog.TryDequeue([ref]$line)) {
        Write-Host "[hue] $line" -ForegroundColor DarkGray
    }
}

function Get-HueStatusPayload {
    $ageMs = $null
    if ($script:HueState.lastCueAt) {
        $ageMs = [int]((([DateTime]::UtcNow) - $script:HueState.lastCueAt).TotalMilliseconds)
    }
    return @{
        type = 'light_status'
        enabled = $script:HueEnabled
        bridgeHealthy = [bool]$script:HueState.bridgeHealthy
        lastCue = $script:HueState.lastCueName
        lastCueAgeMs = $ageMs
        sent60s = [int]$script:HueState.sent60s
        errors60s = [int]$script:HueState.errors60s
        dropped60s = [int]$script:HueState.dropped60s
        queueDepth = [int]$script:HueState.queueDepth
        workerAlive = ($null -ne $script:HueWorker -and -not $script:HueWorker.handle.IsCompleted)
        dryRun = ($env:HUE_DRY_RUN -eq 'true')
    }
}

Start-HueWorker

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

        # Annonce des capacites : le backend n'envoie de cues lumiere que si
        # 'lights@1' est present. Un agent ancien reste donc compatible.
        $caps = @('scripts')
        if ($script:HueEnabled) { $caps += 'lights@1' }
        $hello = @{ type = 'hello'; agentVersion = '2.1'; capabilities = $caps } | ConvertTo-Json -Compress -Depth 4
        $helloBytes = [System.Text.Encoding]::UTF8.GetBytes($hello)
        $helloSeg = New-Object System.ArraySegment[byte] $helloBytes, 0, $helloBytes.Length
        $ws.SendAsync($helloSeg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait() | Out-Null

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
                # Timeout de reception : moment ideal pour la maintenance
                Test-HueWorkerHealth
                Write-HueWorkerLogs
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
                Test-HueWorkerHealth
                Write-HueWorkerLogs
                continue
            }

            # Cue lumiere : on empile et on repart aussitot (fire-and-forget).
            # Aucun travail Hue n'est fait dans cette boucle.
            if ($msg.type -eq "light") {
                if ($script:HueEnabled) {
                    $script:HueQueue.Enqueue($json)
                } 
                continue
            }

            # Sante du sous-systeme lumiere, demandee periodiquement
            if ($msg.type -eq "light_status_request") {
                $statusJson = (Get-HueStatusPayload) | ConvertTo-Json -Compress -Depth 10
                $statusBytes = [System.Text.Encoding]::UTF8.GetBytes($statusJson)
                $statusSeg = New-Object System.ArraySegment[byte] $statusBytes, 0, $statusBytes.Length
                $ws.SendAsync($statusSeg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait() | Out-Null
                Write-HueWorkerLogs
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

            # Handle ping_all - read cached ping results file
            if ($msg.type -eq "ping_all") {
                $pingFile = Join-Path $PSScriptRoot "ping_results.json"
                $pingResponse = @{ type = "ping_status"; results = @{} }

                if (Test-Path $pingFile) {
                    try {
                        $content = Get-Content $pingFile -Raw -Encoding UTF8 | ConvertFrom-Json
                        $fileAge = ((Get-Date) - (Get-Item $pingFile).LastWriteTime).TotalMinutes
                        if ($fileAge -le 10) {
                            $resultsHash = @{}
                            $content.results.PSObject.Properties | ForEach-Object {
                                $resultsHash[$_.Name] = [bool]$_.Value
                            }
                            $pingResponse.results = $resultsHash
                            Write-Host "[ping] Resultats lus ($($resultsHash.Count) machines, age: $([math]::Round($fileAge,1)) min)" -ForegroundColor Green
                        } else {
                            Write-Host "[ping] Fichier trop ancien ($([math]::Round($fileAge,1)) min), resultats ignores" -ForegroundColor Yellow
                        }
                    }
                    catch {
                        Write-Host "[ping] Erreur lecture fichier: $_" -ForegroundColor Red
                    }
                } else {
                    Write-Host "[ping] Fichier ping_results.json introuvable" -ForegroundColor Yellow
                }

                $pingJson = $pingResponse | ConvertTo-Json -Compress -Depth 4
                $pingBytes = [System.Text.Encoding]::UTF8.GetBytes($pingJson)
                $pingSeg = New-Object System.ArraySegment[byte] $pingBytes, 0, $pingBytes.Length
                $ws.SendAsync($pingSeg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).Wait() | Out-Null
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
