# =============================================================================
#  Worker Philips Hue — tourne dans un RUNSPACE separe de la boucle WebSocket.
#
#  Pourquoi un runspace : la boucle de reception de l'agent est mono-thread.
#  Une animation de 12 s executee dedans gelerait la socket (plus de ping, plus
#  de commandes machines). Ici la boucle principale se contente d'empiler le
#  cue en O(1) et repart aussitot en ReceiveAsync.
#
#  Deux couches :
#    1. Scene player : developpe une scene en timeline de pas dates.
#    2. Emitter      : coalescence, plancher par cible, plafond global,
#                      preference aux groupes, transitions natives.
#
#  Variables injectees par SessionStateProxy.SetVariable (aucun objet partage
#  complexe, uniquement des files de chaines et un hashtable synchronise) :
#    $HueQueue  ConcurrentQueue[string]  cues JSON entrants
#    $HueLog    ConcurrentQueue[string]  logs drainees par la boucle principale
#    $HueState  hashtable synchronise    sante remontee au backend
#    $HueConfig hashtable                ip, cle, chemins, seuils, dryRun
#
#  CONTRAINTE : compatible PowerShell 5.1. Pas de -AsHashtable, pas de '??',
#  pas de ForEach-Object -Parallel, -Depth explicite sur tout ConvertTo-Json.
# =============================================================================

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

function Write-HueLog {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss.fff'), $Level, $Message
    $HueLog.Enqueue($line)
    try {
        $logDir = Join-Path $HueConfig.AgentRoot 'logs'
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        $file = Join-Path $logDir ("hue-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
        Add-Content -Path $file -Value $line -Encoding UTF8
    } catch { }
}

# --- PS 5.1 : ConvertFrom-Json rend des PSCustomObject, pas des hashtables ----
function ConvertTo-HashtableDeep {
    param($InputObject)
    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
        $list = @()
        foreach ($item in $InputObject) { $list += ,(ConvertTo-HashtableDeep $item) }
        return $list
    }
    if ($InputObject -is [PSCustomObject]) {
        $h = @{}
        foreach ($p in $InputObject.PSObject.Properties) { $h[$p.Name] = ConvertTo-HashtableDeep $p.Value }
        return $h
    }
    return $InputObject
}

# --- Conversion RGB -> xy (gamma + matrice Wide RGB D65, comme le legacy) -----
function Convert-RgbToXy {
    param([int]$R, [int]$G, [int]$B)
    $rf = $R / 255.0; $gf = $G / 255.0; $bf = $B / 255.0
    $rf = if ($rf -gt 0.04045) { [Math]::Pow(($rf + 0.055) / 1.055, 2.4) } else { $rf / 12.92 }
    $gf = if ($gf -gt 0.04045) { [Math]::Pow(($gf + 0.055) / 1.055, 2.4) } else { $gf / 12.92 }
    $bf = if ($bf -gt 0.04045) { [Math]::Pow(($bf + 0.055) / 1.055, 2.4) } else { $bf / 12.92 }
    $x = $rf * 0.649926 + $gf * 0.103455 + $bf * 0.197109
    $y = $rf * 0.234327 + $gf * 0.743075 + $bf * 0.022598
    $z = $rf * 0.0000000 + $gf * 0.053077 + $bf * 1.035763
    $sum = $x + $y + $z
    if ($sum -eq 0) { return @(0.3127, 0.3290) }
    return @([Math]::Round($x / $sum, 4), [Math]::Round($y / $sum, 4))
}

# --- Chargement config (rechargee a chaud si le fichier change) ---------------
$script:Targets      = $null
$script:Scenes       = $null
$script:ScenesMTime  = [DateTime]::MinValue
$script:TargetsMTime = [DateTime]::MinValue

function Update-HueConfigFiles {
    try {
        $tPath = Join-Path $HueConfig.HueRoot 'targets.json'
        $sPath = Join-Path $HueConfig.HueRoot 'scenes.json'
        $tm = (Get-Item $tPath).LastWriteTimeUtc
        if ($tm -gt $script:TargetsMTime) {
            $script:Targets = ConvertTo-HashtableDeep (Get-Content $tPath -Raw | ConvertFrom-Json)
            $script:TargetsMTime = $tm
            Write-HueLog "targets.json charge"
        }
        $sm = (Get-Item $sPath).LastWriteTimeUtc
        if ($sm -gt $script:ScenesMTime) {
            $script:Scenes = ConvertTo-HashtableDeep (Get-Content $sPath -Raw | ConvertFrom-Json)
            $script:ScenesMTime = $sm
            Write-HueLog "scenes.json recharge (edition a chaud)"
        }
    } catch {
        Write-HueLog "Echec de chargement de la config : $($_.Exception.Message)" 'ERROR'
    }
}

function Resolve-Color {
    param($ColorRef, $Params)
    if ($ColorRef -is [array]) { return $ColorRef }
    if ($ColorRef -eq '$difficulty') {
        $diff = $Params['difficulty']
        # la manche finale est toujours rouge, quelle que soit la difficulte
        if ($Params['isFinal'] -eq $true) { $diff = 'Difficile' }
        $name = $script:Scenes.difficultyColors[$diff]
        if (-not $name) { $name = 'JAUNE' }
        return $script:Scenes.palette[$name]
    }
    $p = $script:Scenes.palette[$ColorRef]
    if ($p) { return $p }
    return @(255, 255, 255)
}

function Resolve-Bri {
    param($BriRef, $Params)
    if ($BriRef -eq '$rankBri') {
        # rang 5 -> 150, rang 2 -> 240 : l'intensite monte vers la 1re place
        $rank = $Params['rank']; if (-not $rank) { $rank = 5 }
        return [int](150 + (5 - $rank) * 30)
    }
    if ($BriRef -is [int]) { return $BriRef }
    return 254
}

# --- Etat de l'emitter -------------------------------------------------------
$script:Pending    = @{}   # cle cible -> @{ state; enqueuedAt; }
$script:LastSentAt = @{}
$script:LastState  = @{}
$script:Timeline   = @()   # pas restants de la scene active
$script:SceneStart = $null
$script:SceneName  = $null
$script:SceneLoop  = $false
$script:SceneLoopMs = 0
$script:SceneParams = @{}
$script:WarnAtMs   = $null
$script:WarnScene  = $null
$script:LastSeq    = [long]-1
$script:TokensGroup  = @{}
$script:LastRefill   = [DateTime]::UtcNow
$script:Sent = New-Object System.Collections.ArrayList
$script:Errors = New-Object System.Collections.ArrayList
$script:Dropped = New-Object System.Collections.ArrayList
$script:SentWindow = New-Object System.Collections.ArrayList  # horodatages de TOUTES les tentatives
$script:BridgeFails = 0
$script:NextProbeAt = [DateTime]::MinValue   # sonde de retablissement

# Plafond STRICT de requetes par seconde glissante. Le bridge Hue sature vers
# 10/s : on garde 20% de marge pour le trafic non issu du jeu (appli Hue du bar).
$RATE_GLOBAL          = if ($HueConfig.RateGlobal) { [int]$HueConfig.RateGlobal } else { 8 }
$MIN_INTERVAL_MS      = if ($HueConfig.MinIntervalMs) { [int]$HueConfig.MinIntervalMs } else { 250 }
# Philips recommande ~1 commande/s en SOUTENU sur un groupe (le bridge eclate
# en interne sur le Zigbee). Le burst de 3 couvre un flash + son retour + un
# ajustement ; la moyenne reste bornee a 1/s. Toutes les scenes du carnet
# tiennent dans ce budget (la plus dense, round_intro, demande 0.67/s/groupe).
$GROUP_RATE           = 1.0
$GROUP_BURST          = 3
$STALE_MS             = 1500
$TICK_MS              = 20

# --- Client HTTP unique (Invoke-RestMethod renegocie a chaque appel) ---------
Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
$script:Http = New-Object System.Net.Http.HttpClient
$script:Http.Timeout = [TimeSpan]::FromSeconds(2)

function Send-HueState {
    param([string]$Kind, [int]$Id, [hashtable]$State)
    $path = if ($Kind -eq 'groups') { "groups/$Id/action" } else { "lights/$Id/state" }
    $url  = "http://$($HueConfig.BridgeIp)/api/$($HueConfig.ApiKey)/$path"
    $json = $State | ConvertTo-Json -Compress -Depth 5

    if ($HueConfig.DryRun) {
        Write-HueLog "DRY-RUN PUT $path $json"
        return $true
    }
    try {
        $content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
        $resp = $script:Http.PutAsync($url, $content).GetAwaiter().GetResult()
        $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        # Hue repond 200 meme en cas d'erreur applicative : le legacy avalait ca
        if ($body -match '"error"') {
            Write-HueLog "Le bridge signale une erreur sur $path : $body" 'WARN'
            $script:Errors.Add([DateTime]::UtcNow) | Out-Null
            return $false
        }
        $script:BridgeFails = 0
        $HueState.bridgeHealthy = $true
        return $true
    } catch {
        $script:BridgeFails++
        $script:Errors.Add([DateTime]::UtcNow) | Out-Null
        if ($script:BridgeFails -ge 3) { $HueState.bridgeHealthy = $false }
        Write-HueLog "PUT $path a echoue : $($_.Exception.Message)" 'ERROR'
        return $false
    }
}

# --- Scene player ------------------------------------------------------------
function Get-SceneDef {
    param([string]$Name)
    $def = $script:Scenes.scenes[$Name]
    if (-not $def) { return $null }
    if ($def['extends']) {
        $parent = $script:Scenes.scenes[$def['extends']]
        if ($parent) {
            $merged = @{}
            foreach ($k in $parent.Keys) { $merged[$k] = $parent[$k] }
            foreach ($k in $def.Keys) { if ($k -ne 'extends') { $merged[$k] = $def[$k] } }
            return $merged
        }
    }
    return $def
}

function Start-Scene {
    param([string]$Name, [hashtable]$Params)
    $def = Get-SceneDef $Name
    if (-not $def) { Write-HueLog "Scene inconnue : $Name" 'WARN'; return }

    $script:SceneName   = $Name
    $script:SceneParams = if ($Params) { $Params } else { @{} }
    $script:SceneStart  = [DateTime]::UtcNow
    $script:SceneLoop   = [bool]$def['loop']
    $script:SceneLoopMs = if ($def['loopMs']) { [int]$def['loopMs'] } else { 0 }
    $script:Timeline    = @()
    foreach ($st in $def['steps']) { $script:Timeline += ,$st }

    # l'alerte des 3 dernieres secondes est armee ICI, a l'horloge du bar :
    # le moment critique ne depend donc jamais du reseau
    $script:WarnAtMs  = $null
    $script:WarnScene = $null
    if ($def['warnScene'] -and $script:SceneParams['warnAtMs']) {
        $script:WarnAtMs  = [int]$script:SceneParams['warnAtMs']
        $script:WarnScene = $def['warnScene']
    }
    Write-HueLog "Scene '$Name' demarree ($($script:Timeline.Count) pas, loop=$($script:SceneLoop))"
    $HueState.lastCue = $Name
    $HueState.lastCueAt = [DateTime]::UtcNow
}

function Step-ScenePlayer {
    if (-not $script:SceneStart) { return }
    $elapsed = ([DateTime]::UtcNow - $script:SceneStart).TotalMilliseconds

    if ($script:WarnAtMs -ne $null -and $elapsed -ge $script:WarnAtMs) {
        $warn = $script:WarnScene
        $script:WarnAtMs = $null
        Start-Scene $warn $script:SceneParams
        return
    }

    $cycleMs = if ($script:SceneLoop -and $script:SceneLoopMs -gt 0) { $elapsed % $script:SceneLoopMs } else { $elapsed }
    $remaining = @()
    foreach ($st in $script:Timeline) {
        if ([double]$st['atMs'] -le $cycleMs) {
            Push-Step $st
        } else {
            $remaining += ,$st
        }
    }
    $script:Timeline = $remaining

    if ($script:Timeline.Count -eq 0 -and $script:SceneLoop -and $script:SceneLoopMs -gt 0) {
        $def = Get-SceneDef $script:SceneName
        if ($def) {
            $script:Timeline = @()
            foreach ($st in $def['steps']) { $script:Timeline += ,$st }
            $script:SceneStart = [DateTime]::UtcNow
        }
    }
}

function Push-Step {
    param($Step)
    $targetName = $Step['target']
    $t = $script:Targets.targets[$targetName]
    if (-not $t) { return }

    $rgb = Resolve-Color $Step['color'] $script:SceneParams
    $xy  = Convert-RgbToXy $rgb[0] $rgb[1] $rgb[2]
    $state = @{ xy = $xy; bri = (Resolve-Bri $Step['bri'] $script:SceneParams) }
    if ($Step['transition'] -ne $null) { $state['transitiontime'] = [int]$Step['transition'] }
    # 'on' seulement quand la scene le demande : rallume une lampe coupee a la
    # main, defaut majeur du legacy qui ne l'envoyait jamais
    if ($Step['on'] -eq $true) { $state['on'] = $true }

    # Preference au GROUPE : 1 requete au lieu de N quand l'etat est uniforme
    if ($t['group']) {
        Enqueue-Target "groups:$($t['group'])" 'groups' ([int]$t['group']) $state
    } elseif ($t['lights']) {
        foreach ($lid in $t['lights']) {
            Enqueue-Target "lights:$lid" 'lights' ([int]$lid) $state
        }
    }
}

function Enqueue-Target {
    param([string]$Key, [string]$Kind, [int]$Id, [hashtable]$State)
    # COALESCENCE structurelle : la derniere ecriture ecrase la precedente,
    # donc une rafale de cues sur la meme cible ne produit qu'un seul PUT
    $script:Pending[$Key] = @{
        kind = $Kind; id = $Id; state = $State; enqueuedAt = [DateTime]::UtcNow
    }
}

# --- Emitter -----------------------------------------------------------------
function Update-Tokens {
    $now = [DateTime]::UtcNow
    $dt = ($now - $script:LastRefill).TotalSeconds
    if ($dt -le 0) { return }
    $script:LastRefill = $now
    foreach ($k in @($script:TokensGroup.Keys)) {
        $script:TokensGroup[$k] = [Math]::Min([double]$GROUP_BURST, $script:TokensGroup[$k] + $dt * $GROUP_RATE)
    }
}

# Plafond global : FENETRE GLISSANTE et non reservoir de jetons. Un reservoir
# laisse passer (capacite + recharge) requetes sur une seconde, donc il ne peut
# pas garantir un plafond strict. Ici on compte les envois de la derniere
# seconde : la borne est exacte par construction.
function Test-GlobalBudget {
    $cut = [DateTime]::UtcNow.AddSeconds(-1)
    while ($script:SentWindow.Count -gt 0 -and $script:SentWindow[0] -lt $cut) {
        $script:SentWindow.RemoveAt(0)
    }
    return ($script:SentWindow.Count -lt $RATE_GLOBAL)
}

function Test-StateChanged {
    param([string]$Key, [hashtable]$State)
    $prev = $script:LastState[$Key]
    if (-not $prev) { return $true }
    $a = $State | ConvertTo-Json -Compress -Depth 5
    $b = $prev  | ConvertTo-Json -Compress -Depth 5
    return ($a -ne $b)
}

function Step-Emitter {
    Update-Tokens
    # Bridge declare KO : on cesse d'emettre (inutile de marteler un bridge
    # eteint, chaque tentative coute un timeout de 2 s) et on purge la file.
    # Le retablissement passe par Test-BridgeRecovery.
    if (-not $HueState.bridgeHealthy) { $script:Pending.Clear(); return }
    if ($script:Pending.Count -eq 0) { return }
    $now = [DateTime]::UtcNow

    # peremption : une commande lumiere en retard est pire que pas de commande
    foreach ($k in @($script:Pending.Keys)) {
        if (($now - $script:Pending[$k].enqueuedAt).TotalMilliseconds -gt $STALE_MS) {
            $script:Pending.Remove($k)
            $script:Dropped.Add($now) | Out-Null
        }
    }

    # candidat = plancher par cible respecte ET etat reellement different
    $candidates = @()
    foreach ($k in @($script:Pending.Keys)) {
        $entry = $script:Pending[$k]
        $last = $script:LastSentAt[$k]
        if ($last -and ($now - $last).TotalMilliseconds -lt $MIN_INTERVAL_MS) { continue }
        if (-not (Test-StateChanged $k $entry.state)) { $script:Pending.Remove($k); continue }
        $candidates += ,@{ key = $k; entry = $entry }
    }
    if ($candidates.Count -eq 0) { return }

    # FIFO sur l'anciennete : aucune cible ne peut etre affamee
    $candidates = $candidates | Sort-Object { $_.entry.enqueuedAt }

    foreach ($c in $candidates) {
        if (-not (Test-GlobalBudget)) { break }
        $isGroup = ($c.entry.kind -eq 'groups')
        if ($isGroup) {
            if (-not $script:TokensGroup.ContainsKey($c.key)) { $script:TokensGroup[$c.key] = [double]$GROUP_BURST }
            if ($script:TokensGroup[$c.key] -lt 1.0) { continue }
        }
        $script:SentWindow.Add([DateTime]::UtcNow) | Out-Null
        $ok = Send-HueState $c.entry.kind $c.entry.id $c.entry.state
        if ($isGroup) { $script:TokensGroup[$c.key] -= 1.0 }
        $script:LastSentAt[$c.key] = [DateTime]::UtcNow
        $script:LastState[$c.key] = $c.entry.state
        $script:Pending.Remove($c.key)
        if ($ok) { $script:Sent.Add([DateTime]::UtcNow) | Out-Null }
    }
}

# Sonde legere toutes les 10 s : un GET /config suffit a savoir si le bridge
# est revenu. Au retablissement on rejoue 'idle' pour resynchroniser le bar
# sur un etat connu (sinon les lampes restent figees sur la derniere couleur).
function Test-BridgeRecovery {
    if ($HueState.bridgeHealthy) { return }
    if ([DateTime]::UtcNow -lt $script:NextProbeAt) { return }
    $script:NextProbeAt = ([DateTime]::UtcNow).AddSeconds(10)
    if ($HueConfig.DryRun) { $HueState.bridgeHealthy = $true; return }
    try {
        $url = "http://$($HueConfig.BridgeIp)/api/$($HueConfig.ApiKey)/config"
        $resp = $script:Http.GetAsync($url).GetAwaiter().GetResult()
        # peu importe le code : une reponse HTTP prouve que le bridge repond
        if ($resp) {
            Write-HueLog "Bridge de nouveau joignable, resynchronisation sur 'idle'"
            $script:BridgeFails = 0
            $HueState.bridgeHealthy = $true
            Start-Scene 'idle' @{}
        }
    } catch {
        # toujours injoignable : on retentera dans 10 s
    }
}

function Trim-Counters {
    $cut = [DateTime]::UtcNow.AddSeconds(-60)
    foreach ($list in @($script:Sent, $script:Errors, $script:Dropped)) {
        while ($list.Count -gt 0 -and $list[0] -lt $cut) { $list.RemoveAt(0) }
    }
}

# --- Boucle principale du worker ---------------------------------------------
Write-HueLog "Worker Hue demarre (bridge=$($HueConfig.BridgeIp) dryRun=$($HueConfig.DryRun) rate=$RATE_GLOBAL/s min=$MIN_INTERVAL_MS ms)"
Update-HueConfigFiles
$lastConfigCheck = [DateTime]::UtcNow
$lastEnsureOn = [DateTime]::UtcNow

while ($true) {
    try {
        $HueState.heartbeat = [DateTime]::UtcNow

        # cues entrants
        $raw = $null
        while ($HueQueue.TryDequeue([ref]$raw)) {
            try {
                $msg = ConvertTo-HashtableDeep ($raw | ConvertFrom-Json)
                $cue = $msg['cue']
                if (-not $cue) { continue }
                # [long] et non [int] : robustesse si un emetteur envoie un
                # numero de sequence base sur un timestamp
                $seq = [long]$cue['seq']
                # un cue plus ancien que le dernier joue est ignore (reordonnancement)
                if ($seq -lt $script:LastSeq) {
                    Write-HueLog "Cue seq=$seq ignore (dernier=$($script:LastSeq))"
                    continue
                }
                $script:LastSeq = $seq
                $params = @{}
                if ($cue['params']) { foreach ($k in $cue['params'].Keys) { $params[$k] = $cue['params'][$k] } }
                Start-Scene ([string]$cue['scene']) $params
            } catch {
                Write-HueLog "Cue illisible : $($_.Exception.Message)" 'ERROR'
            }
        }

        Step-ScenePlayer
        Test-BridgeRecovery
        Step-Emitter
        Trim-Counters

        # rechargement a chaud de scenes.json (toutes les 2 s)
        if (([DateTime]::UtcNow - $lastConfigCheck).TotalSeconds -ge 2) {
            Update-HueConfigFiles
            $lastConfigCheck = [DateTime]::UtcNow
        }

        # rattrapage d'une lampe coupee a la main pendant une partie
        if ($script:SceneName -and $script:SceneName -ne 'idle' -and
            ([DateTime]::UtcNow - $lastEnsureOn).TotalMinutes -ge 5) {
            foreach ($tn in $script:Targets.targets.Keys) {
                $t = $script:Targets.targets[$tn]
                if ($t['group']) { Enqueue-Target "groups:$($t['group'])" 'groups' ([int]$t['group']) @{ on = $true } }
            }
            $lastEnsureOn = [DateTime]::UtcNow
            Write-HueLog "Balayage 'rallumage' des groupes"
        }

        # sante remontee au backend
        $HueState.sent60s      = $script:Sent.Count
        $HueState.errors60s    = $script:Errors.Count
        $HueState.dropped60s   = $script:Dropped.Count
        $HueState.queueDepth   = $script:Pending.Count
        $HueState.lastCueName  = $script:SceneName
    } catch {
        Write-HueLog "Erreur dans la boucle worker : $($_.Exception.Message)" 'ERROR'
    }
    Start-Sleep -Milliseconds $TICK_MS
}
