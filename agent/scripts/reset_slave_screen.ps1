param (
    [string]$TargetName
)

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
} catch {}

$WebhookUrl = "https://recube.app.n8n.cloud/webhook/invader"

function Get-ParisTimeInfo {
    $utcNow  = [DateTime]::UtcNow
    $tz      = [System.TimeZoneInfo]::FindSystemTimeZoneById("Romance Standard Time")
    $paris   = [System.TimeZoneInfo]::ConvertTimeFromUtc($utcNow, $tz)
    $offset  = $tz.GetUtcOffset($paris)
    $sign    = if ($offset.TotalMinutes -ge 0) { '+' } else { '-' }
    $offsetStr = '{0}{1:hh\:mm}' -f $sign, $offset
    $abbr    = if ($tz.IsDaylightSavingTime($paris)) { 'CEST' } else { 'CET' }
    $parisDto  = New-Object System.DateTimeOffset ($paris, $offset)
    $culture   = [System.Globalization.CultureInfo]::GetCultureInfo('fr-FR')
    $parisIso  = $parisDto.ToString("yyyy-MM-dd'T'HH:mm:sszzz", $culture)
    $parisHuman= $paris.ToString("dd/MM/yyyy HH:mm:ss", $culture) + " ($abbr, UTC$offsetStr)"
    [pscustomobject]@{
        UtcIso      = $utcNow.ToString("o")
        ParisIso    = $parisIso
        ParisHuman  = $parisHuman
    }
}

$clients = @(
    "SALON01","TABLE01-1","TABLE01-2","TABLE02-1","TABLE02-2","TABLE03-1","TABLE03-2",
    "TABLE04-1","TABLE04-2","TABLE05-1","TABLE05-2","TABLE06-1","TABLE06-2",
    "TABLE07-1","TABLE07-2","TABLE08-1","TABLE08-2","TABLE09-1","TABLE09-2",
    "TABLE10-1","TABLE10-2","BORNE01","BORNE03","BORNE02","BORNE04",
    "TV01","TV02","TV03","PROJO","BAR01","BAR02"
)

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" }

if (-not $filteredClients) {
    Write-Host "Aucune table ne correspond a: $TargetName - aucun envoi au webhook."
    exit 0
}

$scriptBlock = {
    try {
        $ds = Join-Path $env:WINDIR "System32\DisplaySwitch.exe"

        if (Test-Path $ds) {
            Start-Process -FilePath $ds -ArgumentList "/internal" -WindowStyle Hidden -Wait
            Start-Sleep -Seconds 1
            Start-Process -FilePath $ds -ArgumentList "/extend"   -WindowStyle Hidden -Wait

            return [pscustomobject]@{
                ComputerName = $env:COMPUTERNAME
                Action       = "SlaveScreenReset"
                Status       = "OK"
                Error        = $null
            }
        } else {
            return [pscustomobject]@{
                ComputerName = $env:COMPUTERNAME
                Action       = "SlaveScreenReset"
                Status       = "Error"
                Error        = "DisplaySwitch.exe introuvable"
            }
        }
    } catch {
        return [pscustomobject]@{
            ComputerName = $env:COMPUTERNAME
            Action       = "SlaveScreenReset"
            Status       = "Error"
            Error        = $_.Exception.Message
        }
    }
}

$allResults = Invoke-Command -ComputerName $filteredClients -ScriptBlock $scriptBlock -ErrorAction Continue

$okCount  = ($allResults | Where-Object { $_.Status -eq "OK"    }).Count
$errCount = ($allResults | Where-Object { $_.Status -eq "Error" }).Count

$t = Get-ParisTimeInfo

$payload = @{
    action               = "reset_slave_screen"
    runId                = [guid]::NewGuid().ToString()
    timestampUtc         = $t.UtcIso
    timestampParis       = $t.ParisIso
    timestampParisHuman  = $t.ParisHuman
    launcherHost         = $env:COMPUTERNAME
    targets              = $filteredClients
    summary              = @{
        hostsTotal  = $filteredClients.Count
        hostsOk     = $okCount
        hostsErrors = $errCount
    }
    details              = $allResults
} | ConvertTo-Json -Depth 6

try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    Invoke-RestMethod -Method Post -Uri $WebhookUrl -Body $bytes -ContentType "application/json; charset=utf-8" -TimeoutSec 20
    Write-Host "Webhook (slave_screen_reset) envoye a n8n."
} catch {
    Write-Warning "Echec d envoi au webhook n8n (slave_screen_reset): $($_.Exception.Message)"
}
