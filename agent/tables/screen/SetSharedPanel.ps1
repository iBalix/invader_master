# SetSharedPanel.ps1 - tourne sur un MASTER (TABLExx-1)
# Identifie la dalle PARTAGEE et lui impose une entree.
#
# IDENTIFICATION (verifiee par correlation des numeros de serie EDID entre le
# master et le slave) : sur le master, ControlMyMonitor voit deux moniteurs.
# Celui qui annonce le nom "ELO ET2294L" est la DALLE PARTAGEE ; la dalle
# PROPRE du master annonce un nom vide. Le meme panneau physique presente en
# effet un EDID different selon l'entree par laquelle on l'interroge.
# On ne se fie JAMAIS a l'ordre Monitor0/Monitor1 : tout le code historique
# ecrivait sur Monitor0, qui n'est pas la dalle partagee sur toutes les tables.
#
# POURQUOI LE MASTER ET PAS LE SLAVE : quand la dalle affiche l'entree du
# master, le slave n'arrive plus a la joindre en DDC (lectures a 0, parfois
# plus aucun moniteur enumere). Le master, lui, garde le canal dans les deux
# cas : c'est le seul poste capable de RECUPERER une dalle partie en miroir.

param(
    [ValidateSet('15','17')]
    [string]$TargetInput = '15',
    [switch]$ReportOnly
)

$cmm = 'C:\INVADER\SCRIPTS\screen\controlmymonitor\ControlMyMonitor.exe'
$out = 'C:\INVADER\setsharedpanel.txt'
$csv = "$env:TEMP\ssp_mons.txt"

function Get-Monitors {
    Remove-Item $csv -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $cmm -ArgumentList "/smonitors `"$csv`"" -Wait -WindowStyle Hidden
    $list = @()
    $dev = ''
    foreach ($line in (Get-Content $csv -ErrorAction SilentlyContinue)) {
        if ($line -match 'Monitor Device Name:\s*"(.+?)"') { $dev = $Matches[1]; continue }
        if ($line -match '^\s*Monitor Name:\s*"(.*?)"\s*$' -and $dev -ne '') {
            $list += [pscustomobject]@{ Device = $dev; Name = $Matches[1] }
            $dev = ''
        }
    }
    return $list
}

function Read-Input {
    param([string]$Device)
    [int](Start-Process -FilePath $cmm -ArgumentList "/GetValue `"$Device`" 60" -Wait -PassThru -WindowStyle Hidden).ExitCode
}

$mons = Get-Monitors
$shared = $mons | Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } | Select-Object -First 1
$detail = ($mons | ForEach-Object { "$($_.Device.Split('\')[-1])='$($_.Name)'($(Read-Input $_.Device))" }) -join ' '

if (-not $shared) {
    Set-Content -Path $out -Value "$env:COMPUTERNAME : dalle partagee NON IDENTIFIEE :: $detail" -Encoding Ascii
    return
}

if ($ReportOnly) {
    Set-Content -Path $out -Value "$env:COMPUTERNAME : partagee=$($shared.Device.Split('\')[-1]) entree=$(Read-Input $shared.Device) :: $detail" -Encoding Ascii
    return
}

$before = Read-Input $shared.Device
Start-Process -FilePath $cmm -ArgumentList "/SetValue `"$($shared.Device)`" 60 $TargetInput" -Wait -WindowStyle Hidden
Start-Sleep -Seconds 6
$after = Read-Input $shared.Device

Set-Content -Path $out -Value "$env:COMPUTERNAME : partagee=$($shared.Device.Split('\')[-1]) avant=$before demande=$TargetInput apres=$after" -Encoding Ascii
