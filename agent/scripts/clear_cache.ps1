param (
    [string]$TargetName
)


$clients = @("SALON01", "TABLE01-1", "TABLE01-2", "TABLE02-1", "TABLE02-2", "TABLE03-1", "TABLE03-2", "TABLE04-1", "TABLE04-2", "TABLE05-1", "TABLE05-2", "TABLE06-1", "TABLE06-2", "TABLE07-1", "TABLE07-2", "TABLE08-1", "TABLE08-2", "TABLE09-1", "TABLE09-2", "TABLE10-1", "TABLE10-2", "BORNE01", "BORNE03", "BORNE02", "BORNE04", "TV01", "TV02", "TV03")

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" }

if ($filteredClients) {
    foreach ($client in $filteredClients) {
        Invoke-Command -ScriptBlock { Remove-Item "C:\INVADER\UI\cache\*" -Force -Recurse } -ComputerName $client

        Start-Sleep -Seconds 5

        $uri = "http://$client/menu.php"
        $response = Invoke-RestMethod -Uri $uri -Method Get

        Start-Sleep -Seconds 10

        $uriGame = "http://$client/game.php"
        $responseGame = Invoke-RestMethod -Uri $uriGame -Method Get
    }
} else {
    Write-Host "Aucun client ne correspond a la table specifiee: $TableName"
}
