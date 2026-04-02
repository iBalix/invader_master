param (
    [string]$TargetName
)

$clients = @("SALON01", "TABLE01-1", "TABLE01-2", "TABLE02-1", "TABLE02-2", "TABLE03-1", "TABLE03-2", "TABLE04-1", "TABLE04-2", "TABLE05-1", "TABLE05-2", "TABLE06-1", "TABLE06-2", "TABLE07-1", "TABLE07-2", "TABLE08-1", "TABLE08-2", "TABLE09-1", "TABLE09-2", "TABLE10-1", "TABLE10-2", "BORNE01", "BORNE03", "BORNE02", "BORNE04", "TV01", "TV02", "TV03")

$filteredClients = $clients | Where-Object { $_ -like "*$TargetName*" -and $_ -notlike "*-2" }

if (-not $filteredClients) {
    Write-Host "Aucun client -1 ne correspond a : $TargetName" -ForegroundColor Red
    exit
}

foreach ($client in $filteredClients) {
    Write-Host "`n========================================" -ForegroundColor Magenta
    Write-Host "  ANALYSE USB : $client" -ForegroundColor Magenta
    Write-Host "========================================`n" -ForegroundColor Magenta

    Invoke-Command -ComputerName $client -ScriptBlock {

        Write-Host "--- [1] CONTROLLERS USB (Host Controllers) ---" -ForegroundColor Cyan
        $controllers = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue |
                       Where-Object { $_.FriendlyName -match "Controller|Host|xHCI|EHCI|OHCI|UHCI" }
        foreach ($d in $controllers) {
            Write-Host "  [$($d.Status)] $($d.FriendlyName)" -ForegroundColor $(if ($d.Status -eq "OK") {"Green"} else {"Red"})
            Write-Host "    InstanceId : $($d.InstanceId)"
        }

        Write-Host "`n--- [2] USB HUBS (dont hub alimente) ---" -ForegroundColor Cyan
        $hubs = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue |
                Where-Object { $_.FriendlyName -match "Hub|hub" }
        foreach ($d in $hubs) {
            Write-Host "  [$($d.Status)] $($d.FriendlyName)" -ForegroundColor $(if ($d.Status -eq "OK") {"Green"} else {"Red"})
            Write-Host "    InstanceId : $($d.InstanceId)"
        }

        Write-Host "`n--- [3] TOUS LES DEVICES USB (statut complet) ---" -ForegroundColor Cyan
        $allUsb = Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue | Sort-Object Status
        foreach ($d in $allUsb) {
            $color = if ($d.Status -eq "OK") {"Green"} elseif ($d.Status -eq "Unknown") {"Red"} else {"Yellow"}
            Write-Host "  [$($d.Status)] $($d.FriendlyName)" -ForegroundColor $color
            Write-Host "    InstanceId : $($d.InstanceId)"
        }

        Write-Host "`n--- [4] MANETTES / HID (XInput, Gamepad, Joystick) ---" -ForegroundColor Cyan
        $hid = Get-PnpDevice -Class "HIDClass" -ErrorAction SilentlyContinue | Sort-Object Status
        foreach ($d in $hid) {
            $color = if ($d.Status -eq "OK") {"Green"} else {"Red"}
            Write-Host "  [$($d.Status)] $($d.FriendlyName)" -ForegroundColor $color
            Write-Host "    InstanceId : $($d.InstanceId)"
        }

        Write-Host "`n--- [5] XINPUT / GAMEPAD detectes par Windows ---" -ForegroundColor Cyan
        $xinput = Get-WmiObject Win32_PnPEntity -ErrorAction SilentlyContinue |
                  Where-Object { $_.Name -match "XINPUT|Gamepad|Joystick|Controller|Manette|xinput" }
        if ($xinput) {
            foreach ($d in $xinput) {
                Write-Host "  [$($d.Status)] $($d.Name)" -ForegroundColor $(if ($d.Status -eq "OK") {"Green"} else {"Red"})
                Write-Host "    DeviceID : $($d.DeviceID)"
            }
        } else {
            Write-Host "  Aucun gamepad/XInput detecte par WMI" -ForegroundColor Red
        }

        Write-Host "`n--- [6] DETAILS USB via WMI (VID/PID des devices) ---" -ForegroundColor Cyan
        $wmiUsb = Get-WmiObject Win32_PnPEntity -ErrorAction SilentlyContinue |
                  Where-Object { $_.DeviceID -match "^USB\\" } |
                  Select-Object Name, Status, DeviceID |
                  Sort-Object Status
        foreach ($d in $wmiUsb) {
            $color = if ($d.Status -eq "OK") {"Green"} elseif ($d.Status -eq "Unknown" -or $d.Status -eq $null) {"Red"} else {"Yellow"}
            Write-Host "  [$($d.Status)] $($d.Name)" -ForegroundColor $color
            Write-Host "    DeviceID : $($d.DeviceID)"
        }

        Write-Host "`n--- [7] ERREURS DRIVER USB (ConfigFlags / problemes) ---" -ForegroundColor Cyan
        $problematic = Get-PnpDevice -ErrorAction SilentlyContinue |
                       Where-Object { ($_.Status -eq "Unknown" -or $_.Problem -ne $null) -and $_.InstanceId -match "^USB\\" }
        if ($problematic) {
            foreach ($d in $problematic) {
                Write-Host "  [PROBLEME] $($d.FriendlyName)" -ForegroundColor Red
                Write-Host "    Status  : $($d.Status)"
                Write-Host "    Problem : $($d.Problem)"
                Write-Host "    Id      : $($d.InstanceId)"
            }
        } else {
            Write-Host "  Aucun device USB en erreur detecte" -ForegroundColor Green
        }

        Write-Host "`n--- [8] REGISTRE - ConfigFlags USB (0x40 = install echoue) ---" -ForegroundColor Cyan
        $usbEnumPath = "HKLM:\SYSTEM\CurrentControlSet\Enum\USB"
        if (Test-Path $usbEnumPath) {
            $usbKeys = Get-ChildItem -Path $usbEnumPath -Recurse -ErrorAction SilentlyContinue
            $found = $false
            foreach ($key in $usbKeys) {
                try {
                    $cf = (Get-ItemProperty -Path $key.PSPath -Name "ConfigFlags" -ErrorAction SilentlyContinue).ConfigFlags
                    $devDesc = (Get-ItemProperty -Path $key.PSPath -Name "DeviceDesc" -ErrorAction SilentlyContinue).DeviceDesc
                    $service = (Get-ItemProperty -Path $key.PSPath -Name "Service" -ErrorAction SilentlyContinue).Service
                    if ($cf -ne $null) {
                        $flag = "0x{0:X}" -f $cf
                        $color = if ($cf -band 0x40) {"Red"} elseif ($cf -eq 0) {"Green"} else {"Yellow"}
                        Write-Host "  ConfigFlags=$flag  Service=$service  Desc=$devDesc" -ForegroundColor $color
                        if ($cf -band 0x40) { $found = $true }
                    }
                } catch { }
            }
            if (-not $found) {
                Write-Host "  Aucun ConfigFlags=0x40 (FAILEDINSTALL) trouve" -ForegroundColor Green
            }
        }

        Write-Host "`n--- [9] SYNTHESE ---" -ForegroundColor Magenta
        $okCount = (Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "OK" }).Count
        $koCount = (Get-PnpDevice -Class "USB" -ErrorAction SilentlyContinue | Where-Object { $_.Status -ne "OK" }).Count
        $hidOk   = (Get-PnpDevice -Class "HIDClass" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "OK" }).Count
        Write-Host "  USB OK      : $okCount" -ForegroundColor Green
        Write-Host "  USB KO/Gris : $koCount" -ForegroundColor $(if ($koCount -gt 0) {"Red"} else {"Green"})
        Write-Host "  HID OK      : $hidOk" -ForegroundColor Green
        Write-Host ""

    } -ErrorAction Continue
}
