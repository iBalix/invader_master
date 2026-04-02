param (
    [string]$TargetName,
    [string]$GameName
)

$clients = @("SALON01", "TABLE01-1", "TABLE01-2", "TABLE02-1", "TABLE02-2", "TABLE03-1", "TABLE03-2", "TABLE04-1", "TABLE04-2", "TABLE05-1", "TABLE05-2", "TABLE06-1", "TABLE06-2", "TABLE07-1", "TABLE07-2", "TABLE08-1", "TABLE08-2", "TABLE09-1", "TABLE09-2", "TABLE10-1", "TABLE10-2", "BORNE01", "BORNE03", "BORNE02", "BORNE04", "TV01", "TV02", "TV03")

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" }

if ($filteredClients) {
    $TargetNameWithoutNumbers = $TargetName -replace '\d', ''

    $TargetNameWithoutNumbers = $TargetName -replace '\d', ''

    if ($TargetNameWithoutNumbers -match "BORNE") {
        $TargetNameWithoutNumbers += "S"
    }


    $filePath = "C:\RESSOURCES\$TargetNameWithoutNumbers\gamelock.txt"

    if (Test-Path $filePath) {
        $found = $false
        $rawContent = Get-Content -Path $filePath -Raw

        $fileContent = $rawContent -split "`r`n"

        for ($i = 0; $i -lt $fileContent.Count; $i++) {
            if ($fileContent[$i] -match "^$TargetName=") {
                $fileContent[$i] = "$TargetName=$GameName"
                $found = $true
                break
            }
        }

        Set-Content -Path $filePath -Value $fileContent

    } else {
        Write-Host "Le fichier $filePath n'existe pas."
    }

    foreach ($client in $filteredClients) {
        $destination = "\\$client\c$\INVADER\gamelock.txt"
        Copy-Item -Path $filePath -Destination $destination -Force

        Invoke-Command -ComputerName $client -ScriptBlock {
            Stop-Process -Name *retroarch* -Force -ErrorAction SilentlyContinue
            Stop-Process -Name *msedge* -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "Aucun client ne correspond à la table spécifiée: $TargetName"
}
