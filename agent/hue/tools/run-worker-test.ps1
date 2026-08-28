# Harnais de test du worker Hue : rejoue une sequence de cues realiste contre
# le faux bridge, sans WebSocket ni backend. Usage :
#   pwsh -File agent/hue/tools/run-worker-test.ps1 -BridgeIp 127.0.0.1:8099 -Scenario battle
# Scenarios : battle, quiz, stress, redeploy (celui-ci porte des assertions et
# rend un code de sortie egal au nombre d'echecs).
param(
    [string]$BridgeIp = '127.0.0.1:8099',
    [string]$Scenario = 'battle',
    [switch]$DryRun
)

$hueRoot   = Split-Path $PSScriptRoot -Parent
$agentRoot = Split-Path $hueRoot -Parent

$HueQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$HueLog   = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$HueState = [hashtable]::Synchronized(@{ heartbeat = [DateTime]::UtcNow; bridgeHealthy = $true })
$HueConfig = @{
    BridgeIp = $BridgeIp; ApiKey = 'testkey'; DryRun = [bool]$DryRun
    HueRoot = $hueRoot; AgentRoot = $agentRoot; RateGlobal = 8; MinIntervalMs = 250
}

$rs = [runspacefactory]::CreateRunspace(); $rs.Open()
$rs.SessionStateProxy.SetVariable('HueQueue',  $HueQueue)
$rs.SessionStateProxy.SetVariable('HueLog',    $HueLog)
$rs.SessionStateProxy.SetVariable('HueState',  $HueState)
$rs.SessionStateProxy.SetVariable('HueConfig', $HueConfig)
$ps = [powershell]::Create(); $ps.Runspace = $rs
$ps.AddScript((Get-Content (Join-Path $hueRoot 'hue-worker.ps1') -Raw)) | Out-Null
$handle = $ps.BeginInvoke()
Write-Host "[test] worker demarre dans un runspace separe" -ForegroundColor Cyan

$seq = 0
# Epoque du faux backend. Restart-FakeBackend la change et remet le compteur a
# zero, exactement comme un redeploiement du vrai backend.
$epoch = 1000
function Restart-FakeBackend {
    $script:seq = 0
    $script:epoch++
    Write-Host "[test] === redemarrage du backend simule (epoque $script:epoch, seq remis a 0) ===" -ForegroundColor Magenta
}
function Send-Cue {
    param([string]$Scene, [hashtable]$Params = @{}, [int]$WaitMs = 1000, [switch]$NoEpoch)
    $script:seq++
    $inner = @{ v = 1; seq = $script:seq; scene = $Scene; params = $Params }
    # -NoEpoch rejoue un backend anterieur au correctif : le worker doit alors
    # reconnaitre le redemarrage au seul recul du compteur.
    if (-not $NoEpoch) { $inner['epoch'] = $script:epoch }
    $cue = @{ cue = $inner }
    $HueQueue.Enqueue(($cue | ConvertTo-Json -Compress -Depth 6))
    Write-Host ("[test] -> cue {0,-20} seq={1} epoque={2}" -f $Scene, $script:seq, $(if ($NoEpoch) { '-' } else { $script:epoch })) -ForegroundColor Yellow
    $deadline = (Get-Date).AddMilliseconds($WaitMs)
    while ((Get-Date) -lt $deadline) {
        $line = $null
        while ($HueLog.TryDequeue([ref]$line)) {
            Write-Host "      $line" -ForegroundColor DarkGray
            $script:Journal.Add($line) | Out-Null
        }
        Start-Sleep -Milliseconds 50
    }
}

# Journal des lignes du worker, pour que les scenarios puissent affirmer
# quelque chose au lieu de se contenter d'un affichage a relire a l'oeil.
$Journal = New-Object System.Collections.ArrayList
$Failures = 0
function Assert-Log {
    param([string]$Pattern, [string]$What, [switch]$Absent)
    $hit = @($script:Journal | Where-Object { $_ -match $Pattern }).Count
    $ok = if ($Absent) { $hit -eq 0 } else { $hit -gt 0 }
    if ($ok) {
        Write-Host "[test] OK   $What" -ForegroundColor Green
    } else {
        Write-Host "[test] ECHEC $What (motif '$Pattern' vu $hit fois)" -ForegroundColor Red
        $script:Failures++
    }
}

if ($Scenario -eq 'battle') {
    Write-Host "`n=== SCENARIO BATTLE : 2 questions + paliers + fin ===" -ForegroundColor Green
    Send-Cue 'lobby' @{} 2000
    Send-Cue 'round_intro' @{ durationMs = 5000; round = 1; isFinal = $false } 5000
    Send-Cue 'category' @{ difficulty = 'Facile' } 1500
    # question courte : warn a 2 s pour observer l'alerte armee localement
    Send-Cue 'question_start' @{ durationMs = 5000; warnAtMs = 2000; difficulty = 'Facile' } 5000
    Send-Cue 'question_end' @{} 1000
    Send-Cue 'verdict' @{} 3000
    Send-Cue 'milestone' @{ milestone = 10 } 1500
    Send-Cue 'category' @{ difficulty = 'Difficile'; isFinal = $true } 1500
    Send-Cue 'question_start' @{ durationMs = 5000; warnAtMs = 2000; difficulty = 'Difficile'; isFinal = $true } 5000
    Send-Cue 'round_winner' @{} 2000
    Send-Cue 'round_end' @{ round = 1 } 4000
    Send-Cue 'event_end' @{ durationMs = 9000 } 9000
    Send-Cue 'idle' @{} 1500
} elseif ($Scenario -eq 'quiz') {
    Write-Host "`n=== SCENARIO QUIZ : cinematique complete ===" -ForegroundColor Green
    Send-Cue 'lobby' @{} 2000
    Send-Cue 'category' @{ difficulty = 'Moyen' } 1500
    Send-Cue 'question_start' @{ durationMs = 5000; warnAtMs = 2000; difficulty = 'Moyen' } 5000
    Send-Cue 'question_end' @{} 800
    Send-Cue 'reveal' @{} 1500
    Send-Cue 'leaderboard_reveal' @{} 2000
    foreach ($r in 5,4,3,2) { Send-Cue 'cinematic_step' @{ rank = $r } 2000 }
    Send-Cue 'leaderboard_first' @{ rank = 1 } 3000
    Send-Cue 'rewards_step' @{} 2000
    Send-Cue 'idle' @{} 1500
} elseif ($Scenario -eq 'stress') {
    Write-Host "`n=== SCENARIO STRESS : rafale de cues (test coalescence) ===" -ForegroundColor Green
    foreach ($i in 1..12) { Send-Cue 'category' @{ difficulty = 'Facile' } 80 }
    Send-Cue 'question_start' @{ durationMs = 3000; warnAtMs = 1000; difficulty = 'Difficile' } 4000
    Send-Cue 'idle' @{} 1500
} elseif ($Scenario -eq 'redeploy') {
    # Le bug : le backend redemarre, son compteur de cues repart a 1, le worker
    # est encore a 5, il prend tout ce qui suit pour des retardataires et
    # n'allume plus rien de la soiree.
    Write-Host "`n=== SCENARIO REDEPLOY : le backend redemarre en pleine partie ===" -ForegroundColor Green

    Write-Host "`n-- Partie en cours, compteur qui monte --" -ForegroundColor Cyan
    Send-Cue 'lobby' @{} 1200
    Send-Cue 'category' @{ difficulty = 'Facile' } 1200
    Send-Cue 'question_start' @{ durationMs = 3000; warnAtMs = 1000; difficulty = 'Facile' } 3500
    Send-Cue 'question_end' @{} 800
    Send-Cue 'reveal' @{} 1500

    Write-Host "`n-- Redeploiement : nouvelle epoque, compteur a zero --" -ForegroundColor Cyan
    Restart-FakeBackend
    $Journal.Clear()
    Send-Cue 'category' @{ difficulty = 'Moyen' } 1500
    Send-Cue 'question_start' @{ durationMs = 3000; warnAtMs = 1000; difficulty = 'Moyen' } 3500
    Assert-Log "Nouvel emetteur" "le worker voit le changement d'emetteur"
    Assert-Log "Scene 'category' demarree" "la scene d'apres redeploiement est jouee"
    Assert-Log "Scene 'question_start' demarree" "la question d'apres redeploiement est jouee"
    Assert-Log "ignore \(dernier=" "aucun cue jete" -Absent

    Write-Host "`n-- Backend anterieur au correctif : aucune epoque envoyee --" -ForegroundColor Cyan
    $Journal.Clear()
    $seq = 0
    Send-Cue 'reveal' @{} 1200 -NoEpoch
    Send-Cue 'leaderboard_reveal' @{} 1200 -NoEpoch
    $seq = 0   # « redemarrage » d'un emetteur qui ne sait pas se presenter
    Send-Cue 'lobby' @{} 1200 -NoEpoch
    Send-Cue 'category' @{ difficulty = 'Difficile' } 1500 -NoEpoch
    Assert-Log "Compteur reparti en arriere" "le recul du compteur est reconnu comme un redemarrage"
    Assert-Log "Scene 'category' demarree" "la scene qui suit est jouee malgre l'absence d'epoque"
    Assert-Log "ignore \(dernier=" "aucun cue jete" -Absent

    Send-Cue 'idle' @{} 1200
}

Write-Host "`n[test] scenario termine, arret du worker" -ForegroundColor Cyan
$line = $null
while ($HueLog.TryDequeue([ref]$line)) { Write-Host "      $line" -ForegroundColor DarkGray }
Write-Host ("[test] compteurs : envoyes60s={0} erreurs60s={1} abandonnes60s={2}" -f $HueState.sent60s, $HueState.errors60s, $HueState.dropped60s) -ForegroundColor Cyan
if ($Failures -gt 0) {
    Write-Host "[test] $Failures assertion(s) en echec" -ForegroundColor Red
} else {
    Write-Host "[test] toutes les assertions passent" -ForegroundColor Green
}
$ps.Stop(); $ps.Dispose(); $rs.Dispose()
exit $Failures
