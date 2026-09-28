# MasterToSlaveIfNoRetroarch.ps1 - v4 du 2026-09-28 - tourne sur les MASTERS
#
# Filet de securite de la dalle partagee (la dalle du -2, cablee aux DEUX PC :
# HDMI = ce master en clone, DP = le slave). Session interactive rkiosk.
#
# CE QU'IL FAUT SAVOIR SUR CES DALLES (mesure sur le parc le 28/09)
#
#   * Le panneau partage presente un EDID DIFFERENT selon l'entree par
#     laquelle on l'interroge. Vu du master il s'annonce "ELO ET2294L" ; la
#     dalle PROPRE du master, elle, remonte un nom vide. Correlation des
#     numeros de serie EDID master/slave faite sur les 10 tables : la regle
#     tient partout. C'est le critere d'identification utilise ici, plutot que
#     l'ordre Monitor0/Monitor1 qui n'est garanti par rien.
#
#   * Chaque PC ne dialogue en DDC avec le panneau que lorsque SA propre
#     entree est affichee. Des que la dalle bascule sur le master, le slave ne
#     la lit plus (valeurs a 0, parfois plus aucun moniteur enumere). C'est
#     pour cela que la RECUPERATION d'une dalle partie en miroir ne peut venir
#     que du MASTER : le slave, lui, est aveugle precisement quand il faudrait
#     qu'il agisse. La v3 confiait cette recuperation au slave : elle ne
#     pouvait pas fonctionner.
#
# POURQUOI LE MIROIR APPARAIT AU DEMARRAGE DU BAR
#   Le lanceur du master fait DisplaySwitch /clone : sa sortie HDMI s'allume et
#   l'auto-selection de source du moniteur suit ce nouveau signal. Le garde-fou
#   historique (le slave demande au master, par WinRM, de lancer la tache
#   MasterToSlave 15 s apres son Edge) tombe souvent dans le vide : a cet
#   instant le master finit de demarrer et son service WinRM n'est pas pret.
#   L'echec est avale, et il n'y a AUCUNE reprise - verifie sur TABLE05, ou la
#   tache n'a pas tourne une seule fois depuis le boot. Ce script est donc le
#   seul vrai filet, d'ou la cadence rapide pendant les premieres minutes.

$log     = 'C:\INVADER\log.txt'
$cmm     = 'C:\INVADER\SCRIPTS\screen\controlmymonitor\ControlMyMonitor.exe'
$slave   = $env:COMPUTERNAME -replace '-1$', '-2'
$csv     = "$env:TEMP\wd_smonitors.txt"

$INPUT_SLAVE  = 15
$INPUT_MASTER = 17
$SHARED_EDID  = 'ELO ET2294L'   # nom annonce par la dalle PARTAGEE vue du master

$FAST_WINDOW_SEC = 300
$FAST_INTERVAL   = 10
$SLOW_INTERVAL   = 120

function Write-Log {
    param([string]$m)
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $m"
}

function Get-Monitors {
    Remove-Item $csv -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $cmm -ArgumentList "/smonitors `"$csv`"" -Wait -WindowStyle Hidden
    $list = @()
    $dev = ''
    foreach ($line in (Get-Content $csv -ErrorAction SilentlyContinue)) {
        if ($line -match 'Monitor Device Name:\s*"(.+?)"') { $dev = $Matches[1]; continue }
        if ($line -match '^\s*Monitor Name:\s*"(.*?)"\s*$' -and $dev -ne '') {
            $list += [pscustomobject]@{ Device = $dev; Name = $Matches[1] }
            $dev = ''
        }
    }
    return $list
}

# Nom EDID exact si possible, sinon tout moniteur au nom non vide : on ne veut
# surtout pas viser la dalle propre du master (nom vide) et la pousser vers une
# entree sans signal.
function Get-SharedPanel {
    param($Monitors)
    $m = $Monitors | Where-Object { $_.Name -eq $SHARED_EDID } | Select-Object -First 1
    if ($m) { return $m.Device }
    $m = $Monitors | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } | Select-Object -First 1
    if ($m) { return $m.Device }
    return $null
}

function Read-Input {
    param([string]$Device)
    try {
        return [int](Start-Process -FilePath $cmm -ArgumentList "/GetValue `"$Device`" 60" -Wait -PassThru -WindowStyle Hidden).ExitCode
    } catch { return 0 }
}

function Test-GameRunning {
    return [bool](Get-Process -Name 'retroarch' -ErrorAction SilentlyContinue)
}

# Topologie des sorties : en clone les deux moniteurs sont sous \\.\DISPLAY1.
# Un bureau ETENDU laisse la dalle partagee sur un fond vide (ecran noir).
function Get-TopologyState {
    param($Monitors)
    if (-not $Monitors -or $Monitors.Count -eq 0) { return 'inconnu' }
    $d1 = @($Monitors | Where-Object { $_.Device -match 'DISPLAY1' }).Count
    $d2 = @($Monitors | Where-Object { $_.Device -notmatch 'DISPLAY1' }).Count
    if ($d2 -gt 0) { return 'etendu' }
    if ($d1 -ge 2) { return 'clone' }
    if ($d1 -eq 1) { return 'simple' }
    return 'inconnu'
}

$startedAt = Get-Date
$mons0 = Get-Monitors
Write-Log ("Watchdog ecran v4 demarre - topologie: {0} - dalle partagee: {1} - cadence rapide {2}s" -f `
    (Get-TopologyState $mons0), $(if (Get-SharedPanel $mons0) { (Get-SharedPanel $mons0).Split('\')[-1] } else { 'NON IDENTIFIEE' }), $FAST_WINDOW_SEC)

while ($true) {

    $inFastWindow = ((Get-Date) - $startedAt).TotalSeconds -lt $FAST_WINDOW_SEC

    if (-not (Test-GameRunning)) {

        $mons = Get-Monitors
        $topo = Get-TopologyState $mons

        if ($topo -eq 'etendu' -or $topo -eq 'simple') {
            Write-Log "ECRAN: mode clone PERDU (topologie=$topo) -> DisplaySwitch /clone"
            Start-Process -FilePath "$env:WINDIR\System32\DisplaySwitch.exe" -ArgumentList '/clone' -WindowStyle Hidden -Wait
            Start-Sleep -Seconds 5
            $mons = Get-Monitors
            Write-Log "ECRAN: apres reparation, topologie=$(Get-TopologyState $mons)"
        }

        $panel = Get-SharedPanel $mons

        # Une partie a pu demarrer pendant la reparation du clone.
        if ($panel -and -not (Test-GameRunning)) {
            if ((Read-Input $panel) -eq $INPUT_MASTER) {
                Write-Log "ECRAN: la dalle partagee affiche le master hors partie (miroir) -> retour au slave"
                for ($try = 1; $try -le 3; $try++) {
                    Start-Process -FilePath $cmm -ArgumentList "/SetValue `"$panel`" 60 $INPUT_SLAVE" -Wait -WindowStyle Hidden
                    Start-Sleep -Seconds 5
                    $now = Read-Input $panel
                    if ($now -ne $INPUT_MASTER) {
                        Write-Log "ECRAN: dalle rendue au slave (tentative $try, lecture=$now)"
                        break
                    }
                    if ($try -eq 3) { Write-Log "ECRAN: la dalle reste sur le master apres 3 tentatives" }
                }
            }
            # Le slave rafraichit sa propre vue quand il en est capable.
            # Sans consequence s'il est injoignable : le filet, c'est ici.
            try {
                Invoke-Command -ComputerName $slave -ScriptBlock {
                    schtasks /run /tn MasterToSlaveDDC | Out-Null
                } -ErrorAction Stop
            } catch { }
        }
    }

    Start-Sleep -Seconds $(if ($inFastWindow) { $FAST_INTERVAL } else { $SLOW_INTERVAL })
}
