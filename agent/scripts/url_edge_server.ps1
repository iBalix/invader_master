param (
    [string]$TargetName,
    [string]$GameName
)

$clients = @("SALON01", "TABLE01-1", "TABLE01-2", "TABLE02-1", "TABLE02-2", "TABLE03-1", "TABLE03-2", "TABLE04-1", "TABLE04-2", "TABLE05-1", "TABLE05-2", "TABLE06-1", "TABLE06-2", "TABLE07-1", "TABLE07-2", "TABLE08-1", "TABLE08-2", "TABLE09-1", "TABLE09-2", "TABLE10-1", "TABLE10-2", "BORNE01", "BORNE03", "BORNE02", "BORNE04", "TV01", "TV02", "TV03", "PROJO", "BAR01", "BAR02")

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" }

if (!$filteredClients) {
    Write-Host "Aucun client ne correspond a la table specifiee: $TargetName"
    exit
}

foreach ($client in $filteredClients) {
    Write-Host "`nTraitement de $client..."

    try {
        $forceURLFile = "C:\INVADER\forceURL.txt"

        Invoke-Command -ComputerName $client -ScriptBlock {
            param ($GameName, $forceURLFile)
            
            if (-not (Test-Path "C:\INVADER")) {
                New-Item -Path "C:\INVADER" -ItemType Directory -Force | Out-Null
            }

            if (-not (Test-Path $forceURLFile)) {
                New-Item -Path $forceURLFile -ItemType File -Force | Out-Null
            }

            Set-Content -Path $forceURLFile -Value $GameName
        } -ArgumentList $GameName, $forceURLFile

        Write-Host "L URL a ete ecrite dans $client : $GameName"
    }
    catch {
        Write-Host "Une erreur est survenue lors du traitement de $client : $_"
    }
}

Write-Host "`nTous les clients ont ete traites."
