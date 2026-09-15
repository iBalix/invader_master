# WebCall.ps1 - handler du protocole invader: (lance par Edge via cmd /c start)
# v2 du 2026-09-15 : rebascule de la dalle partagee fiabilisee.
#
# La dalle du -2 est cablee aux DEUX PCs (HDMI/17 = master en clone, DP/15 =
# slave). L'ancienne rebascule ecrivait 4 fois sur \\.\DISPLAY1\Monitor0 du
# MASTER : or l'ordre Monitor0/Monitor1 y est une loterie d'enumeration, et
# quand Monitor0 designait la dalle du master, la commande partait sur le
# mauvais ecran -> dalle partagee coincee sur l'entree HDMI apres le jeu
# (ecran noir si le clone etait casse). La v2 delegue la rebascule au SLAVE
# (tache MasterToSlaveDDC) : lui n'a qu'UN moniteur, zero ambiguite. C'est le
# strict miroir de la bascule aller (tache SlaveToMaster), fiable depuis 2 ans.

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
    # Voie historique (marche quand Monitor0 est la dalle partagee ; sans
    # danger sinon : la dalle du master est deja sur son entree DP)
    & 'C:\INVADER\SCRIPTS\screen\controlmymonitor\ControlMyMonitor.exe' /SetValue "\\.\DISPLAY1\Monitor0" 60 15
    # Voie fiable : le slave rebascule sa propre dalle
    $slaveName = (hostname) -replace "-1$", "-2"
    try {
        Invoke-Command -ComputerName $slaveName -ScriptBlock {
            schtasks /run /tn MasterToSlaveDDC | Out-Null
        } -ErrorAction Stop
    } catch {
        Add-Content -Path $logFile -Value "Rebascule via slave impossible: $($_.Exception.Message)"
    }
}

function ChangeSlaveScreen {
    param()

    $computerName = hostname
    $slaveComputerName = $computerName -replace "-1$", "-2"
    $command = 'schtasks /run /tn SlaveToMaster'

    # Use Invoke-Command to run the command on the remote computer
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
    Start-Sleep 3
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
            # Passage de l'ecran slave en copie du master, attente de la fin
            # du jeu, puis rebascule de la dalle vers le slave
            ChangeSlaveScreen
        }
    }
}
