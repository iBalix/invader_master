param (
    [string]$TargetName
)

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
Write-Host "Termine : $okCount OK, $errCount erreur(s)"
