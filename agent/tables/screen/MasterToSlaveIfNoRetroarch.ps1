# MasterToSlaveIfNoRetroarch.ps1 - v3 du 2026-09-15
#
# Filet de securite de la dalle partagee (dalle du -2, cablee aux DEUX PCs :
# HDMI/17 = ce master en clone, DP/15 = le slave). Tourne dans la session
# interactive rkiosk (tache GPP a l'ouverture de session).
#
# CE QUE LA V3 CORRIGE :
# 1. L'ordre \.\DISPLAY1\Monitor0 / Monitor1 sur le master est une LOTERIE
#    d'enumeration : Monitor0 est parfois la dalle du master, et la rebascule
#    historique partait alors sur le mauvais ecran. La v3 delegue la rebascule
#    au SLAVE (tache MasterToSlaveDDC declenchee par WinRM) : le slave n'a
#    qu'un moniteur, zero ambiguite. L'ecriture locale est conservee en
#    complement (sans danger : la dalle du master est deja sur son entree).
# 2. Si le master a perdu le mode CLONE (sequelle de l'ancien
#    reset_slave_screen qui terminait en /extend, ou d'un /internal reste en
#    plan), la dalle partagee recoit un bureau etendu vide ou plus de signal
#    du tout -> ecran noir persistant. La v3 le detecte via ControlMyMonitor
#    /smonitors (en clone, les DEUX moniteurs sont sous \.\DISPLAY1) et
#    repare par DisplaySwitch /clone, uniquement hors partie.

$log = 'C:\INVADER\log.txt'
$cmm = 'C:\INVADER\SCRIPTS\screen\controlmymonitor\ControlMyMonitor.exe'
$slave = $env:COMPUTERNAME -replace '-1$', '-2'
$monFile = "$env:TEMP\wd_smonitors.txt"

function Write-Log { param([string]$m)
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $m"
}

# Etat des sorties video, vu de la session interactive.
# clone  : 2 moniteurs sous \.\DISPLAY1  (etat nominal)
# etendu : un moniteur sous \.\DISPLAY2  (rebascule DDC non fiable)
# simple : 1 seul moniteur en tout        (seconde sortie coupee, dalle muette)
function Get-TopologyState {
    Remove-Item $monFile -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $cmm -ArgumentList "/smonitors `"$monFile`"" -Wait -WindowStyle Hidden
    if (-not (Test-Path $monFile)) { return 'inconnu' }
    $names = (Get-Content $monFile | Where-Object { $_ -match 'Monitor Device Name' })
    $d1 = @($names | Where-Object { $_ -match 'DISPLAY1' }).Count
    $d2 = @($names | Where-Object { $_ -notmatch 'DISPLAY1' }).Count
    if ($d2 -gt 0) { return 'etendu' }
    if ($d1 -ge 2) { return 'clone' }
    if ($d1 -eq 1) { return 'simple' }
    return 'inconnu'
}

Write-Log "Watchdog ecran v3 demarre - surveillance de retroarch (topologie: $(Get-TopologyState))"

while ($true) {
    if (-not (Get-Process -Name 'retroarch' -ErrorAction SilentlyContinue)) {

        $topo = Get-TopologyState
        if ($topo -eq 'etendu' -or $topo -eq 'simple') {
            Write-Log "ECRAN: mode clone PERDU (topologie=$topo) -> DisplaySwitch /clone"
            Start-Process -FilePath "$env:WINDIR\System32\DisplaySwitch.exe" -ArgumentList '/clone' -WindowStyle Hidden -Wait
            Start-Sleep -Seconds 5
            Write-Log "ECRAN: apres reparation, topologie=$(Get-TopologyState)"
        }

        # Une partie a pu se lancer pendant la reparation : on re-verifie
        # avant de toucher a l'entree de la dalle.
        if (-not (Get-Process -Name 'retroarch' -ErrorAction SilentlyContinue)) {
            # Voie historique (fonctionne quand Monitor0 est la dalle partagee)
            & $cmm /SetValue '\.\DISPLAY1\Monitor0' 60 15
            # Voie fiable : le slave rebascule sa propre dalle
            try {
                Invoke-Command -ComputerName $slave -ScriptBlock {
                    schtasks /run /tn MasterToSlaveDDC | Out-Null
                } -ErrorAction Stop
            } catch { }
        }
    }
    Start-Sleep -Seconds 120
}
