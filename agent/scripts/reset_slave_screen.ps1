param (
    [string]$TargetName
)

# reset_slave_screen v2 du 2026-09-15
#
# POURQUOI CETTE VERSION : l'ancienne faisait /internal puis /extend sur TOUS
# les postes matchant TargetName, y compris les MASTERS (TABLExx-1). Or l'etat
# nominal d'un master est le CLONE (edge.ps1 le pose au boot) : le laisser en
# /extend cassait la table au jeu suivant (bureau etendu vide sur la dalle
# partagee = ecran noir, et rebascule DDC visant le mauvais moniteur). Chaque
# usage du bouton back-office armait donc la panne qu'il pretendait reparer.
# Desormais : un MASTER termine en /clone, un poste a ecran unique (slave,
# borne, TV) termine en /internal. Le passage transitoire par un autre mode
# force la renegociation de la sortie video (c'est le but du reset), avec des
# pauses suffisantes pour laisser le pilote appliquer chaque topologie.

$clients = @(
    "SALON01","TABLE01-1","TABLE01-2","TABLE02-1","TABLE02-2","TABLE03-1","TABLE03-2",
    "TABLE04-1","TABLE04-2","TABLE05-1","TABLE05-2","TABLE06-1","TABLE06-2",
    "TABLE07-1","TABLE07-2","TABLE08-1","TABLE08-2","TABLE09-1","TABLE09-2",
    "TABLE10-1","TABLE10-2","BORNE01","BORNE03","BORNE02","BORNE04",
    "TV01","TV02","TV03","PROJO","BAR01","BAR02"
)

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" }

if (-not $filteredClients) {
    Write-Host "Aucune table ne correspond a: $TargetName"
    exit 0
}

$scriptBlock = {
    try {
        $ds = Join-Path $env:WINDIR "System32\DisplaySwitch.exe"
        if (-not (Test-Path $ds)) {
            return [pscustomobject]@{ ComputerName = $env:COMPUTERNAME; Action = "SlaveScreenReset"; Status = "Error"; Error = "DisplaySwitch.exe introuvable" }
        }

        $isMaster = $env:COMPUTERNAME -like "*-1"
        if ($isMaster) {
            # Master : renegociation puis retour a l'etat nominal = CLONE
            Start-Process -FilePath $ds -ArgumentList "/internal" -WindowStyle Hidden -Wait
            Start-Sleep -Seconds 3
            Start-Process -FilePath $ds -ArgumentList "/clone" -WindowStyle Hidden -Wait
        } else {
            # Ecran unique : l'aller-retour force la sortie video a se rallumer
            Start-Process -FilePath $ds -ArgumentList "/extend" -WindowStyle Hidden -Wait
            Start-Sleep -Seconds 3
            Start-Process -FilePath $ds -ArgumentList "/internal" -WindowStyle Hidden -Wait
        }
        Start-Sleep -Seconds 2

        # Sur un slave de table : remet aussi la dalle partagee sur son entree
        # DP via la tache locale (sans effet si elle n'existe pas sur ce poste)
        if ($env:COMPUTERNAME -like "TABLE*-2") {
            & schtasks /run /tn MasterToSlaveDDC 2>&1 | Out-Null
        }

        return [pscustomobject]@{ ComputerName = $env:COMPUTERNAME; Action = "SlaveScreenReset"; Status = "OK"; Error = $null }
    } catch {
        return [pscustomobject]@{ ComputerName = $env:COMPUTERNAME; Action = "SlaveScreenReset"; Status = "Error"; Error = $_.Exception.Message }
    }
}

$allResults = Invoke-Command -ComputerName $filteredClients -ScriptBlock $scriptBlock -ErrorAction Continue

$okCount  = ($allResults | Where-Object { $_.Status -eq "OK"    }).Count
$errCount = ($allResults | Where-Object { $_.Status -eq "Error" }).Count
Write-Host "Termine : $okCount OK, $errCount erreur(s)"
