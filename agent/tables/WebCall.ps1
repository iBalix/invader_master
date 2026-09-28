# WebCall.ps1 - handler du protocole invader: (lance par Edge via cmd /c start)
# v3 du 2026-09-28 : la rebascule de fin de jeu est ciblee et verifiee.
#
# La dalle du -2 est cablee aux DEUX PC (HDMI = ce master en clone, DP = le
# slave) et bascule par DDC/CI. Deux choses a savoir, mesurees sur le parc :
#
#   * Le panneau partage presente un EDID different selon l'entree par
#     laquelle on l'interroge : vu du master il s'annonce "ELO ET2294L",
#     tandis que la dalle PROPRE du master remonte un nom vide. C'est le
#     critere d'identification fiable (correlation des numeros de serie EDID
#     master/slave verifiee sur les 10 tables), au lieu de l'ordre
#     Monitor0/Monitor1 que rien ne garantit.
#
#   * Chaque PC ne parle en DDC au panneau que lorsque SA propre entree est
#     affichee. Pendant et juste apres un jeu, la dalle est sur l'entree du
#     master : le slave est alors aveugle et ne peut PAS se la redonner. La
#     rebascule de fin de partie doit donc venir du master. C'est le role de
#     SetSharedPanel.ps1, qui vise la bonne dalle et verifie le resultat.

# Retrieve the URL parameter from the command line
$urlParameter = $args[0]

# Parse URL parameters
$urlParams = $urlParameter -split '&'

# Initialize variables
$cmd = $null
$game = $null
$isTable = "0"
$libcore = $null

$logFile = "C:\INVADER\log.txt"

function Set-SharedScreenToSlave {
    # Voie fiable : ciblage par EDID + verification, depuis le master.
    & powershell.exe -ExecutionPolicy Bypass -File 'C:\INVADER\SCRIPTS\screen\SetSharedPanel.ps1' -TargetInput 15
    # Rafraichissement cote slave, une fois qu'il revoit la dalle. Sans effet
    # s'il est injoignable : le filet, c'est la ligne au-dessus.
    $slaveName = (hostname) -replace "-1$", "-2"
    try {
        Invoke-Command -ComputerName $slaveName -ScriptBlock {
            schtasks /run /tn MasterToSlaveDDC | Out-Null
        } -ErrorAction Stop
    } catch {
        Add-Content -Path $logFile -Value "Rafraichissement slave impossible: $($_.Exception.Message)"
    }
}

function ChangeSlaveScreen {
    param()

    $computerName = hostname
    $slaveComputerName = $computerName -replace "-1$", "-2"
    $command = 'schtasks /run /tn SlaveToMaster'

    # Bascule ALLER : c'est le slave qui donne la dalle au master. Lui la voit
    # encore a cet instant, donc c'est bien lui qui peut le faire.
    Invoke-Command -ComputerName $slaveComputerName -ScriptBlock {
        param($command)
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c $command" -NoNewWindow -Wait
    } -ArgumentList $command

    Start-Sleep 5

    $processName = 'retroarch'
    # Loop while the process is running
    while (Get-Process -Name $processName -ErrorAction SilentlyContinue) {
        Start-Sleep -Seconds 2  # Adjust the sleep duration as needed
    }
    Add-Content -Path C:\INVADER\log.txt -Value "Retroarch ferme"
    Set-SharedScreenToSlave
}

# Loop through URL parameters
foreach ($param in $urlParams) {
    $name, $value = $param -split '='

    switch ($name) {
        "cmd" { $cmd = $value }
        "game" { $game = $value }
        "libcore" { $libcore = $value }
        "istable" { $isTable = $value }
        # Add more cases for additional variables as needed
    }
}

if ($game -eq "ITF"){
$game = "International Track & Field (EU)/International Track & Field (EU).cue"
}

if ($game -eq "BustAMove"){
$game = "Bust-A-Move 2 - Arcade Edition (USA)/Bust-A-Move 2 - Arcade Edition (USA).cue"
}

if ($game -eq "PocketFighter"){
$game = "Pocket Fighter (USA)/Pocket Fighter (USA).cue"
}

# Build a string with the extracted variables
$logEntry = "cmd: $cmd, game (if exist): $game, IsTable: $isTable, lib: $libcore"

# Append the log entry to the log file
Add-Content -Path $logFile -Value $logEntry

if ($cmd -eq "reboot"){
    Add-Content -Path $logFile -Value "Reboot en cours"
    restart-computer -force
}
if ($cmd -eq "shutdown"){
    Add-Content -Path $logFile -Value "Arret en cours"
    stop-computer -force
}
if ($cmd -eq "quitgame"){
    Add-Content -Path $logFile -Value "Fermeture Retroarch demandee par WebCall"
    Stop-Process -Name "retroarch" -Force
}

if ($cmd -eq "retroarch"){
    # Check if the process is running
    $test = Get-Process -Name *retroarch* -ErrorAction SilentlyContinue

    # Check if the process is running and store the result in a variable
    if ($test) {
        Stop-Process -Name *retroarch* -ErrorAction SilentlyContinue
    } else {
        #ALL : lancement de retroarch
        & "C:\INVADER\RetroArch\retroarch.exe" -L C:\INVADER\RetroArch\cores\$libcore C:\INVADER\RetroArch\downloads\$game
        Add-Content -Path $logFile -Value "Retroarch lance"

        #TABLE :
        if($isTable -eq "1"){
            # Donne la dalle au master, attend la fin du jeu, puis la rend
            ChangeSlaveScreen
        }
    }
}
