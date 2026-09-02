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

        $ecrit = Invoke-Command -ComputerName $client -ScriptBlock {
            param ($GameName, $forceURLFile)

            # 'DEFAULT' = retour a l'ecran de demarrage du poste. Le back-office
            # ne connait pas cette URL : on la lit ICI, sur le poste lui-meme
            # (kioskURL.txt), et on l'ecrit comme n'importe quelle URL forcee.
            # Une chaine vide ne ferait rien : l'agent ne la transmet pas et le
            # lanceur garde la derniere URL en memoire jusqu'au reboot.
            if ($GameName -eq 'DEFAULT') {
                $kioskFile = "C:\INVADER\kioskURL.txt"
                $default = ""
                if (Test-Path $kioskFile) { $default = (Get-Content -Path $kioskFile -Raw).Trim() }
                if ([string]::IsNullOrWhiteSpace($default)) {
                    throw "kioskURL.txt absent ou vide, retour au defaut impossible"
                }
                $GameName = $default
            }

            if (-not (Test-Path "C:\INVADER")) {
                New-Item -Path "C:\INVADER" -ItemType Directory -Force | Out-Null
            }

            if (-not (Test-Path $forceURLFile)) {
                New-Item -Path $forceURLFile -ItemType File -Force | Out-Null
            }

            Set-Content -Path $forceURLFile -Value $GameName
            $GameName
        } -ArgumentList $GameName, $forceURLFile

        Write-Host "L URL a ete ecrite dans $client : $ecrit"
    }
    catch {
        Write-Host "Une erreur est survenue lors du traitement de $client : $_"
    }
}

Write-Host "`nTous les clients ont ete traites."
