param (
    [string]$TargetName
)

$clients = @("SALON01", "TABLE01-1", "TABLE01-2", "TABLE02-1", "TABLE02-2", "TABLE03-1", "TABLE03-2", "TABLE04-1", "TABLE04-2", "TABLE05-1", "TABLE05-2", "TABLE06-1", "TABLE06-2", "TABLE07-1", "TABLE07-2", "TABLE08-1", "TABLE08-2", "TABLE09-1", "TABLE09-2", "TABLE10-1", "TABLE10-2", "BORNE01", "BORNE03", "BORNE02", "BORNE04", "TV01", "TV02", "TV03")

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" -and $_ -notlike "*-2" }

if (-not $filteredClients) {
    Write-Host "Aucun client -1 ne correspond à : $TargetName" -ForegroundColor Red
    exit
}

foreach ($client in $filteredClients) {
    Write-Host "`n========================================" -ForegroundColor Magenta
    Write-Host "  FIX POWER USB : $client" -ForegroundColor Magenta
    Write-Host "========================================`n" -ForegroundColor Magenta

    Invoke-Command -ComputerName $client -ScriptBlock {

        Write-Host "  [1/5] Désactivation Selective Suspend USB global..." -ForegroundColor Yellow

        $usbServiceKey = "HKLM:\SYSTEM\CurrentControlSet\Services\USB"
        if (-not (Test-Path $usbServiceKey)) {
            New-Item -Path $usbServiceKey -Force | Out-Null
        }
        Set-ItemProperty -Path $usbServiceKey -Name "DisableSelectiveSuspend" -Value 1 -Type DWord -Force
        Write-Host "    DisableSelectiveSuspend = 1 (global)" -ForegroundColor Green

        Write-Host "`n  [2/5] Désactivation power management sur tous les hubs USB..." -ForegroundColor Yellow

        $usbClassKey = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{36FC9E60-C465-11CF-8056-444553540000}"
        if (Test-Path $usbClassKey) {
            Set-ItemProperty -Path $usbClassKey -Name "HcDisableSelectiveSuspend" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
            Write-Host "    HcDisableSelectiveSuspend = 1 (classe USB)" -ForegroundColor Green

            $instances = Get-ChildItem -Path $usbClassKey -ErrorAction SilentlyContinue
            foreach ($inst in $instances) {
                try {
                    Set-ItemProperty -Path $inst.PSPath -Name "HcDisableSelectiveSuspend" -Value 1 -Type DWord -Force -ErrorAction Stop
                    Set-ItemProperty -Path $inst.PSPath -Name "DisableSelectiveSuspend" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
                    $name = (Get-ItemProperty -Path $inst.PSPath -Name "DriverDesc" -ErrorAction SilentlyContinue).DriverDesc
                    Write-Host "    Appliqué sur instance : $name" -ForegroundColor Green
                } catch { }
            }
        }

        Write-Host "`n  [3/5] Désactivation 'turn off to save power' sur chaque hub..." -ForegroundColor Yellow

        $usbHubs = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue |
                   Where-Object { $_.FriendlyName -match "Hub|Root Hub" -and $_.Status -eq "OK" }

        foreach ($hub in $usbHubs) {
            try {
                $devRegPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\$($hub.InstanceId)\Device Parameters"
                if (-not (Test-Path $devRegPath)) {
                    New-Item -Path $devRegPath -Force | Out-Null
                }
                Set-ItemProperty -Path $devRegPath -Name "EnhancedPowerManagementEnabled" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
                Set-ItemProperty -Path $devRegPath -Name "SelectiveSuspendEnabled" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
                Write-Host "    Power mgmt désactivé : $($hub.FriendlyName)" -ForegroundColor Green
            } catch {
                Write-Host "    Erreur sur : $($hub.FriendlyName) - $_" -ForegroundColor Red
            }
        }

        Write-Host "`n  [4/5] Passage en plan alimentation Haute Performance..." -ForegroundColor Yellow

        $highPerfGuid = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
        $result = & powercfg /setactive $highPerfGuid 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    Plan Haute Performance activé" -ForegroundColor Green
        } else {
            & powercfg /duplicatescheme $highPerfGuid 2>&1 | Out-Null
            & powercfg /setactive $highPerfGuid 2>&1 | Out-Null
            Write-Host "    Plan Haute Performance créé et activé" -ForegroundColor Green
        }

        & powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null
        & powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 2>&1 | Out-Null
        & powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null
        Write-Host "    USB Selective Suspend désactivé dans le plan actif" -ForegroundColor Green

        Write-Host "`n  [5/5] Re-énumération du bus USB..." -ForegroundColor Yellow

        $hubs = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue |
                Where-Object { $_.FriendlyName -match "Hub" -and $_.Status -eq "OK" }

        foreach ($hub in $hubs) {
            try { Disable-PnpDevice -InstanceId $hub.InstanceId -Confirm:$false -ErrorAction Stop } catch { }
        }
        Start-Sleep -Seconds 2
        foreach ($hub in $hubs) {
            try { Enable-PnpDevice -InstanceId $hub.InstanceId -Confirm:$false -ErrorAction Stop } catch { }
        }
        Start-Sleep -Seconds 3

        & pnputil /scan-devices 2>&1 | Out-Null

        Write-Host "`n  --- Etat manettes post-fix ---" -ForegroundColor Cyan
        $manettes = Get-PnpDevice -ErrorAction SilentlyContinue |
                    Where-Object { $_.InstanceId -match "VID_081F|VID_045E.*028E|VID_057E|VID_20D6" }
        if ($manettes) {
            foreach ($m in $manettes | Where-Object { $_.Status -eq "OK" }) {
                Write-Host "  [OK] $($m.FriendlyName)" -ForegroundColor Green
                Write-Host "    $($m.InstanceId)"
            }
            $ko = $manettes | Where-Object { $_.Status -ne "OK" }
            if ($ko) {
                Write-Host "  Toujours en erreur : $($ko.Count) manette(s)" -ForegroundColor Red
                Write-Host "  -> Un redémarrage du PC peut être nécessaire pour appliquer le registre" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  Aucune manette détectée" -ForegroundColor Red
        }

        Write-Host "`n  Si toujours KO après ce script : redémarrer le PC cible" -ForegroundColor Yellow
        Write-Host "     Les clés de registre selective suspend nécessitent un reboot" -ForegroundColor Yellow

    } -ErrorAction Continue
}
