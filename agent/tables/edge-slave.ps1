# edge-slave.ps1 - Lanceur du kiosque Edge sur les PC SLAVE des tables (TABLExx-2)
#
# ROLE
#   Meme role que edge-master.ps1 mais pour le second ecran de la table : c'est
#   lui qui decide quelle URL Edge affiche sur la dalle slave. Deploye sur le
#   poste sous le nom C:\INVADER\SCRIPTS\edge.ps1
#   ATTENTION : C:\INVADER\SCRIPTS n'est PAS synchronise depuis le serveur (la GPO
#   CopyFilesV2 ne recopie que RETROARCH et WEBSERVER). Toute modification doit
#   donc etre poussee a la main sur les postes concernes.
#
# QUI LE LANCE
#   Demarrage du PC -> ouverture de session automatique de INVADER\rkiosk
#   (GPO "KIOSK", AutoAdminLogon) -> ce script tourne en session interactive,
#   fenetre masquee, et ne s'arrete jamais.
#
# DIFFERENCE AVEC LE MASTER
#   Pas d'amorcage de cache (menu.php / game.php) : c'est le master qui le fait.
#   A la place, une fois Edge affiche, le slave declenche la tache MasterToSlave
#   sur le master de sa table pour que la repartition des ecrans soit correcte.
#   Le nom du master est deduit du sien (suffixe -2 remplace par -1).
#
# QUELLE URL EST AFFICHEE
#   Par defaut : le contenu de C:\INVADER\kioskURL.txt, soit l'ancienne interface
#   PHP servie en local (ex. http://localhost?type=table_slave).
#   Si C:\INVADER\forceURL.txt contient une URL, elle prend le dessus dans les 5
#   secondes. Ce fichier est ecrit par le back-office (commande url_edge_server,
#   bouton "Basculer vers interface V2" de la page Gestion du bar), qui envoie un
#   appel PAR ECRAN afin que chaque dalle recoive son propre hostname.
#   Il est VIDE apres lecture et l'URL forcee n'est gardee qu'en memoire : la
#   bascule dure donc le temps de la session, et un redemarrage du PC ramene le
#   poste sur kioskURL.txt.
#   Le parametre hostname n'est ajoute que s'il manque, avec le bon separateur
#   (? si l'URL n'a pas encore de query string, & sinon).
#
# POURQUOI CETTE VERSION EXISTE (correction du 21/08/2026)
#   L'ancienne version lisait kioskURL.txt UNE SEULE FOIS au demarrage et sa
#   boucle de relance reutilisait cette valeur gardee en memoire. Elle ne lisait
#   jamais forceURL.txt. Resultat : le bouton du back-office ecrivait bien l'URL
#   sur le poste et tuait bien Edge, mais la boucle le relancait aussitot sur
#   l'ancienne interface. L'URL forcee etait donc systematiquement ignoree.
#
# CONTRAINTES
#   PowerShell 5.1, aucun caractere accentue dans ce fichier.

$EdgePath      = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$KioskUrlFile  = "C:\INVADER\kioskURL.txt"
$ForceUrlFile  = "C:\INVADER\forceURL.txt"
$EdgeFlags     = "--edge-kiosk-type=fullscreen --no-first-run"
$TickSeconds   = 5

# Lecture tolerante : fichier absent, vide ou avec retour a la ligne final
function Read-UrlFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) { return "" }
    $raw = Get-Content -Path $Path -Raw -ErrorAction SilentlyContinue
    if ($null -eq $raw) { return "" }
    return $raw.Trim()
}

# L'interface a besoin de savoir quel ecran elle est. On n'ajoute le parametre
# que s'il manque : le back-office l'envoie deja dans l'URL forcee.
function Add-HostnameParam {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) { return $Url }
    if ($Url -match 'hostname=') { return $Url }
    if ($Url.Contains('?')) { return ($Url + '&hostname=' + $env:COMPUTERNAME) }
    return ($Url + '?hostname=' + $env:COMPUTERNAME)
}

# msedge et non *edge* : *edge* attrape aussi MicrosoftEdgeUpdate, ce qui ferait
# croire a la boucle qu'un navigateur tourne alors qu'il n'y a que l'updater.
function Get-EdgeProcess {
    return (Get-Process -Name msedge -ErrorAction SilentlyContinue)
}

function Stop-Edge {
    if (Get-EdgeProcess) {
        Stop-Process -Name msedge -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

function Start-Kiosk {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) { return }
    Start-Process -FilePath $EdgePath -ArgumentList ("--kiosk " + $Url + " " + $EdgeFlags)
}

# ---------------------------------------------------------------------------
# Demarrage
# ---------------------------------------------------------------------------
Start-Process -FilePath "C:\INVADER\WEBSERVER\PHP\php-cgi.exe" -ArgumentList "-b 127.0.0.1:9000" -WorkingDirectory "C:\INVADER\WEBSERVER\PHP" -NoNewWindow
Start-Process -FilePath "C:\INVADER\WEBSERVER\NGINX\nginx.exe" -WorkingDirectory "C:\INVADER\WEBSERVER\NGINX\" -NoNewWindow

& "C:\Windows\System32\DisplaySwitch.exe" /clone

Start-Sleep -Seconds 5

$CurrentUrl = Add-HostnameParam (Read-UrlFile $KioskUrlFile)
Start-Kiosk $CurrentUrl

# Remise en place de la repartition des ecrans par le master. Declenche plusieurs
# fois : la tache est parfois lancee trop tot, avant que le master ait fini de
# demarrer. En try/catch pour ne jamais empecher la boucle de relance de tourner.
Start-Sleep -Seconds 15
$masterComputerName = $env:COMPUTERNAME -replace '-2$', '-1'
try {
    Invoke-Command -ComputerName $masterComputerName -ScriptBlock {
        for ($i = 0; $i -lt 6; $i++) {
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c schtasks /run /tn MasterToSlave" -NoNewWindow
        }
    } -ErrorAction SilentlyContinue
} catch { }

# ---------------------------------------------------------------------------
# Boucle de surveillance : l'URL est RELUE a chaque tour, jamais mise en cache
# ---------------------------------------------------------------------------
while ($true) {

    $forced = Read-UrlFile $ForceUrlFile
    if (-not [string]::IsNullOrWhiteSpace($forced)) {
        $CurrentUrl = Add-HostnameParam $forced
        Clear-Content -Path $ForceUrlFile -ErrorAction SilentlyContinue
        Stop-Edge
    }

    if (-not (Get-EdgeProcess)) {
        Start-Kiosk $CurrentUrl
        Start-Sleep -Seconds 5
    }

    Start-Sleep -Seconds $TickSeconds
}
