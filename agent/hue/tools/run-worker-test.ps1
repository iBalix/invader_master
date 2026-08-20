# Harnais de test du worker Hue : rejoue une sequence de cues realiste contre
# le faux bridge, sans WebSocket ni backend. Usage :
#   pwsh -File agent/hue/tools/run-worker-test.ps1 -BridgeIp 127.0.0.1:8099 -Scenario battle
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
function Send-Cue {
    param([string]$Scene, [hashtable]$Params = @{}, [int]$WaitMs = 1000)
    $script:seq++
    $cue = @{ cue = @{ v = 1; seq = $script:seq; scene = $Scene; params = $Params } }
    $HueQueue.Enqueue(($cue | ConvertTo-Json -Compress -Depth 6))
    Write-Host ("[test] -> cue {0,-20} seq={1}" -f $Scene, $script:seq) -ForegroundColor Yellow
    $deadline = (Get-Date).AddMilliseconds($WaitMs)
    while ((Get-Date) -lt $deadline) {
        $line = $null
        while ($HueLog.TryDequeue([ref]$line)) { Write-Host "      $line" -ForegroundColor DarkGray }
        Start-Sleep -Milliseconds 50
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
}

Write-Host "`n[test] scenario termine, arret du worker" -ForegroundColor Cyan
$line = $null
while ($HueLog.TryDequeue([ref]$line)) { Write-Host "      $line" -ForegroundColor DarkGray }
Write-Host ("[test] compteurs : envoyes60s={0} erreurs60s={1} abandonnes60s={2}" -f $HueState.sent60s, $HueState.errors60s, $HueState.dropped60s) -ForegroundColor Cyan
$ps.Stop(); $ps.Dispose(); $rs.Dispose()
