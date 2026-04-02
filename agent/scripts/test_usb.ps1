param (
    [string]$TargetName
)

$clients = @("SALON01", "TABLE01-1", "TABLE01-2", "TABLE02-1", "TABLE02-2", "TABLE03-1", "TABLE03-2", "TABLE04-1", "TABLE04-2", "TABLE05-1", "TABLE05-2", "TABLE06-1", "TABLE06-2", "TABLE07-1", "TABLE07-2", "TABLE08-1", "TABLE08-2", "TABLE09-1", "TABLE09-2", "TABLE10-1", "TABLE10-2", "BORNE01", "BORNE03", "BORNE02", "BORNE04", "TV01", "TV02", "TV03")

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" }

if ($filteredClients) {
    foreach ($client in $filteredClients) {
        Write-Host "==> Reset USB bas niveau sur : $client" -ForegroundColor Cyan

        Invoke-Command -ComputerName $client -ScriptBlock {

            Write-Host "  [1/5] Suppression des périphériques USB fantômes..." -ForegroundColor Yellow

            $env:DEVMGR_SHOW_NONPRESENT_DEVICES = 1

            $allUsbDevices = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue
            $ghostDevices = $allUsbDevices | Where-Object { $_.Status -eq "Unknown" -or $_.Present -eq $false }

            foreach ($ghost in $ghostDevices) {
                try {
                    $result = & pnputil /remove-device "$($ghost.InstanceId)" 2>&1
                    Write-Host "    Fantôme supprimé : $($ghost.FriendlyName) [$($ghost.InstanceId)]" -ForegroundColor DarkYellow
                } catch {
                    Write-Host "    Erreur suppression : $($ghost.FriendlyName) - $_" -ForegroundColor Red
                }
            }

            Write-Host "  [2/5] Nettoyage registre USB (ConfigFlags corrompus)..." -ForegroundColor Yellow

            $usbEnumPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\USB"
            if (Test-Path $usbEnumPath) {
                $usbKeys = Get-ChildItem -Path $usbEnumPath -Recurse -ErrorAction SilentlyContinue
                foreach ($key in $usbKeys) {
                    try {
                        $configFlags = (Get-ItemProperty -Path $key.PSPath -Name "ConfigFlags" -ErrorAction SilentlyContinue).ConfigFlags
                        if ($configFlags -band 0x40) {
                            Set-ItemProperty -Path $key.PSPath -Name "ConfigFlags" -Value 0 -ErrorAction SilentlyContinue
                            Write-Host "    Registre corrigé : $($key.PSChildName) (ConfigFlags=$configFlags -> 0)"
                        }
                    } catch { }
                }
            }

            Write-Host "  [3/5] Restart services USB bas niveau..." -ForegroundColor Yellow

            $usbServices = @("usbhub", "usbhub3", "USBSTOR", "HidUsb", "xhci", "usbxhci", "usbehci", "usbohci", "usbuhci")
            foreach ($svc in $usbServices) {
                try {
                    & sc.exe stop $svc 2>&1 | Out-Null
                } catch { }
            }

            Start-Sleep -Seconds 2

            foreach ($svc in $usbServices) {
                try {
                    & sc.exe start $svc 2>&1 | Out-Null
                    Write-Host "    Service redémarré : $svc"
                } catch { }
            }

            Write-Host "  [4/5] Re-énumération complète du bus USB..." -ForegroundColor Yellow

            $hubs = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue | 
                    Where-Object { $_.FriendlyName -match "Hub|hub" -and $_.Status -ne "Unknown" }

            foreach ($hub in $hubs) {
                try {
                    Disable-PnpDevice -InstanceId $hub.InstanceId -Confirm:$false -ErrorAction Stop
                } catch { }
            }

            $controllers = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue | 
                           Where-Object { $_.FriendlyName -match "Controller|Host" -and $_.Status -ne "Unknown" }

            foreach ($ctrl in $controllers) {
                try {
                    Disable-PnpDevice -InstanceId $ctrl.InstanceId -Confirm:$false -ErrorAction Stop
                } catch { }
            }

            Start-Sleep -Seconds 3

            foreach ($ctrl in $controllers) {
                try {
                    Enable-PnpDevice -InstanceId $ctrl.InstanceId -Confirm:$false -ErrorAction Stop
                    Write-Host "    Controller réactivé : $($ctrl.FriendlyName)"
                } catch { }
            }

            Start-Sleep -Seconds 2

            foreach ($hub in $hubs) {
                try {
                    Enable-PnpDevice -InstanceId $hub.InstanceId -Confirm:$false -ErrorAction Stop
                    Write-Host "    Hub réactivé : $($hub.FriendlyName)"
                } catch { }
            }

            Write-Host "  [5/5] Scan nouveau matériel (hardware rescan)..." -ForegroundColor Yellow

            $scanResult = & pnputil /scan-devices 2>&1
            Write-Host "    $scanResult"

            Start-Sleep -Seconds 3

            Write-Host "`n  --- Etat final des périphériques USB ---" -ForegroundColor Cyan
            $finalState = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue | 
                          Select-Object Status, FriendlyName, InstanceId |
                          Sort-Object Status
            foreach ($dev in $finalState) {
                $color = if ($dev.Status -eq "OK") { "Green" } 
                         elseif ($dev.Status -eq "Unknown") { "Red" } 
                         else { "Yellow" }
                Write-Host "    [$($dev.Status)] $($dev.FriendlyName)" -ForegroundColor $color
            }

            Write-Host "`n  --- Manettes / HID Devices ---" -ForegroundColor Cyan
            $hidDevices = Get-PnpDevice -Class "HIDClass" -ErrorAction SilentlyContinue |
                          Select-Object Status, FriendlyName
            foreach ($hid in $hidDevices) {
                $color = if ($hid.Status -eq "OK") { "Green" } else { "Red" }
                Write-Host "    [$($hid.Status)] $($hid.FriendlyName)" -ForegroundColor $color
            }

            Write-Host "`n  Reset USB terminé sur $env:COMPUTERNAME" -ForegroundColor Green

        } -ErrorAction Continue

        Write-Host ""
    }
} else {
    Write-Host "Aucun client ne correspond à : $TargetName" -ForegroundColor Red
}
