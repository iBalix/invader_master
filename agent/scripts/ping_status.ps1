# ping_status.ps1 - Ping toutes les machines du bar et ecrit les resultats en JSON
# Tourne en boucle, une passe toutes les 5 minutes

$clients = @(
    "SRV1",
    "PROJO",
    "TABLE01-1", "TABLE01-2",
    "TABLE02-1", "TABLE02-2",
    "TABLE03-1", "TABLE03-2",
    "TABLE04-1", "TABLE04-2",
    "TABLE05-1", "TABLE05-2",
    "TABLE06-1", "TABLE06-2",
    "TABLE07-1", "TABLE07-2",
    "TABLE08-1", "TABLE08-2",
    "TABLE09-1", "TABLE09-2",
    "TABLE10-1", "TABLE10-2",
    "BORNE01", "BORNE02", "BORNE03", "BORNE04",
    "TV01", "TV02", "TV03",
    "BAR01", "BAR02"
)

$outputFile = Join-Path $PSScriptRoot "..\ping_results.json"
$pinger = New-Object System.Net.NetworkInformation.Ping
$timeoutMs = 1500

Write-Host "[ping] Demarrage du monitoring - $($clients.Count) machines, cycle toutes les 5 min" -ForegroundColor Cyan
Write-Host "[ping] Fichier de sortie: $outputFile" -ForegroundColor Cyan

while ($true) {
    $results = @{}
    $okCount = 0
    $koCount = 0

    foreach ($client in $clients) {
        try {
            $reply = $pinger.Send($client, $timeoutMs)
            $alive = $reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success
        }
        catch {
            $alive = $false
        }

        $results[$client] = $alive

        if ($alive) { $okCount++ } else { $koCount++ }
    }

    $payload = @{
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        results   = $results
    }

    $payload | ConvertTo-Json -Depth 3 | Set-Content -Path $outputFile -Encoding UTF8

    Write-Host "[ping] $(Get-Date -Format 'HH:mm:ss') - OK: $okCount | KO: $koCount" -ForegroundColor $(if ($koCount -eq 0) { "Green" } else { "Yellow" })

    Start-Sleep -Seconds 300
}
