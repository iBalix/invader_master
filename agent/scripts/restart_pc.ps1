param (
    [string]$TargetName
)

$clients = @(
    "SALON01","TABLE01-1","TABLE01-2","TABLE02-1","TABLE02-2","TABLE03-1","TABLE03-2",
    "TABLE04-1","TABLE04-2","TABLE05-1","TABLE05-2","TABLE06-1","TABLE06-2",
    "TABLE07-1","TABLE07-2","TABLE08-1","TABLE08-2","TABLE09-1","TABLE09-2",
    "TABLE10-1","TABLE10-2","BORNE01","BORNE03","BORNE02","BORNE04","TV01","TV02","TV03","PROJO","BAR01","BAR02"
)

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" }

if (-not $filteredClients) {
    Write-Host "Aucune table ne correspond a: $TargetName"
    exit 0
}

$results = @()
foreach ($client in $filteredClients) {
    try {
        Invoke-Command -ComputerName $client -ScriptBlock { shutdown /r /t 0 } -ErrorAction Stop
        $results += [pscustomobject]@{ host = $client; status = "OK";  error = $null }
        Write-Host "Reboot envoye a $client : OK"
    } catch {
        $results += [pscustomobject]@{ host = $client; status = "Error"; error = $_.Exception.Message }
        Write-Host "Erreur reboot $client : $($_.Exception.Message)"
    }
}

$okCount  = ($results | Where-Object { $_.status -eq "OK" }).Count
$errCount = ($results | Where-Object { $_.status -eq "Error" }).Count
Write-Host "Termine : $okCount OK, $errCount erreur(s)"
