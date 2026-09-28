# EnsureSlaveInput.ps1 - v2 du 2026-09-28 - tourne sur les SLAVES (TABLExx-2)
#
# ROLE
#   Garantit que la dalle partagee affiche bien l'entree du slave
#   (DisplayPort, VCP 60 = 15) et non celle du master (HDMI = 17), qui donne
#   le fameux "ecran en miroir" hors partie.
#
# POURQUOI C'EST LE SLAVE QUI LE FAIT
#   Le slave n'a qu'UN moniteur : \\.\DISPLAY1\Monitor0 y designe forcement la
#   dalle partagee. Sur le master, Monitor0 est sa PROPRE dalle et Monitor1 la
#   dalle partagee (verifie sur les 10 tables le 28/09) : tout le code
#   historique qui ecrivait sur Monitor0 depuis le master s'adressait donc au
#   mauvais ecran.
#
# PARTICULARITE DDC DE CES DALLES (mesure le 28/09 sur TABLE08)
#   Le moniteur ne repond aux LECTURES que sur son entree ACTIVE : des qu'il
#   affiche le master, une lecture depuis le slave renvoie 0. Les ECRITURES,
#   elles, passent toujours. Une lecture a 0 ne veut donc pas dire "panne",
#   elle veut dire "ce n'est pas nous qui sommes affiches" - autrement dit
#   exactement le cas qu'on doit corriger. Et apres une bascule, la dalle met
#   quelques secondes a re-repondre : d'ou le delai de stabilisation avant de
#   relire, sinon on conclut a tort a un echec.
#
# DEUX MODES
#   (defaut)   une passe : lit, corrige si besoin, verifie. C'est ce qu'appelle
#              la tache MasterToSlaveDDC (fin de jeu + watchdog du master).
#   -BootMode  assertion repetee : au demarrage du bar, la dalle bascule sur le
#              master des qu'il allume sa sortie HDMI (DisplaySwitch /clone de
#              son lanceur) car l'auto-selection de source suit le nouveau
#              signal. L'ancien garde-fou ne tentait qu'UNE fois, par WinRM
#              vers un master souvent pas encore pret, sans aucune reprise.
#
# CONTRAINTES : PowerShell 5.1, aucun caractere accentue.
#   ControlMyMonitor est une appli GUI : "& exe" ne remplit PAS $LASTEXITCODE,
#   il faut Start-Process -Wait -PassThru pour lire son code de sortie.

param(
    [switch]$BootMode,
    [int]$DurationSec = 240,
    [int]$IntervalSec = 10
)

$cmm          = 'C:\INVADER\SCRIPTS\screen\controlmymonitor\ControlMyMonitor.exe'
$monitor      = '\\.\DISPLAY1\Monitor0'
$INPUT_SLAVE  = 15   # DisplayPort - ce PC
$INPUT_MASTER = 17   # HDMI        - le master (legitime UNIQUEMENT pendant un jeu)
$SETTLE_SEC   = 5    # temps que met la dalle a re-repondre apres une bascule
$log          = 'C:\INVADER\log.txt'
$master       = $env:COMPUTERNAME -replace '-2$', '-1'

function Write-Log {
    param([string]$m)
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $m"
}

# Retourne 15, 17, ou 0 quand la dalle ne repond pas (= elle affiche l'autre
# entree, ou elle est encore en train de se resynchroniser).
function Get-CurrentInput {
    try {
        return [int](Start-Process -FilePath $cmm -ArgumentList "/GetValue `"$monitor`" 60" -Wait -PassThru -WindowStyle Hidden).ExitCode
    } catch { return 0 }
}

function Set-InputToSlave {
    Start-Process -FilePath $cmm -ArgumentList "/SetValue `"$monitor`" 60 $INPUT_SLAVE" -Wait -WindowStyle Hidden
}

# Une partie en cours sur le master est la SEULE raison legitime d'avoir la
# dalle sur l'entree HDMI : il ne faut surtout pas la lui reprendre.
# Master injoignable = master pas encore demarre = aucune partie possible.
function Test-GameOnMaster {
    try {
        return [bool](Invoke-Command -ComputerName $master -ScriptBlock {
            [bool](Get-Process -Name retroarch -ErrorAction SilentlyContinue)
        } -ErrorAction Stop)
    } catch { return $false }
}

# Retourne $true si la dalle est (ou vient d'etre remise) sur notre entree.
function Assert-SlaveInput {
    param([switch]$Quiet)

    if ((Get-CurrentInput) -eq $INPUT_SLAVE) { return $true }

    # Pas nous a l'ecran : soit une partie tourne (normal), soit il faut agir.
    if (Test-GameOnMaster) {
        if (-not $Quiet) { Write-Log "ECRAN: dalle sur le master, partie en cours -> on ne touche a rien" }
        return $true
    }

    for ($try = 1; $try -le 3; $try++) {
        Set-InputToSlave
        Start-Sleep -Seconds $SETTLE_SEC
        if ((Get-CurrentInput) -eq $INPUT_SLAVE) {
            Write-Log "ECRAN: dalle recuperee sur l'entree du slave (tentative $try)"
            return $true
        }
    }
    Write-Log "ECRAN: la dalle ne confirme pas son retour sur l'entree du slave"
    return $false
}

if (-not $BootMode) {
    Assert-SlaveInput | Out-Null
    return
}

# --- Mode boot -------------------------------------------------------------
# On tient la dalle pendant quelques minutes : l'ordre de demarrage des deux PC
# n'est pas garanti, et le master peut allumer sa sortie HDMI bien apres nous.
Write-Log "ECRAN: garde de boot demarree (${DurationSec}s, verification toutes les ${IntervalSec}s)"
$deadline = (Get-Date).AddSeconds($DurationSec)
$corrections = 0
while ((Get-Date) -lt $deadline) {
    if (Test-GameOnMaster) {
        Write-Log "ECRAN: partie lancee sur le master, fin de la garde de boot"
        break
    }
    if ((Get-CurrentInput) -ne $INPUT_SLAVE) {
        if (Assert-SlaveInput -Quiet) { $corrections++ }
    }
    Start-Sleep -Seconds $IntervalSec
}
Write-Log "ECRAN: garde de boot terminee ($corrections correction(s), entree finale: $(Get-CurrentInput))"
