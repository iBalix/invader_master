# Setup agent Windows - Tables tactiles V2

Ce document decrit la configuration a appliquer sur chaque PC Windows
embarque dans une table tactile pour l'interface V2 (`/table/*`).

> Une table physique = 2 PC = 2 ecrans cote a cote.
> Hostname strict :
>   - Master : `TABLEXX-1` (ex. `TABLE01-1`)
>   - Slave  : `TABLEXX-2` (ex. `TABLE01-2`)
> XX = numero de table (01, 02, ...).

---

## 1. Pre-requis

- Windows 10/11
- Chrome (ou Edge) en mode kiosque
- Acces internet (l'app est servie depuis Railway)
- Hostname Windows correctement configure (`Sysdm.cpl` > Modifier)
- Port LAN ouvert vers le projecteur/server admin local pour les CTA event

---

## 2. URL kiosque

L'interface tables est accessible en production sur :

```
https://invadermaster-frontend-production.up.railway.app/table
```

Lors du tout premier lancement, on doit indiquer le hostname dans l'URL
en query param :

```
https://invadermaster-frontend-production.up.railway.app/table?hostname=TABLE01-1
```

L'app va memoriser le hostname dans `localStorage` et le renvoyer ensuite
dans le header `X-Hostname` de chaque appel API. Apres le premier passage
de `?hostname=`, on peut repasser sur l'URL sans param.

> Si la cle `localStorage` est perdue (cache vide), l'app affiche une
> page `Setup` qui redemande le hostname. Pour automatiser : toujours
> deployer le raccourci avec `?hostname=...`.

---

## 3. Lancement Chrome en kiosque

Creer un raccourci sur le bureau (et dans `Demarrage` pour autostart) :

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --kiosk ^
  --no-first-run ^
  --noerrdialogs ^
  --disable-translate ^
  --disable-features=TranslateUI ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --autoplay-policy=no-user-gesture-required ^
  "https://invadermaster-frontend-production.up.railway.app/table?hostname=TABLE01-1"
```

Pour le slave, idem en remplacant `TABLE01-1` par `TABLE01-2`.

> Astuce : `--app=` peut remplacer `--kiosk` si tu veux un mode "fenetre
> sans chrome" plutot que plein ecran force.

---

## 4. Custom protocol `invader://`

Les jeux (emulateurs) sont lances via une URL custom qui declenche un
binaire local (`InvaderLauncher.exe` deja existant). Pour que Chrome
sache rediriger vers le binaire :

1. Installer le launcher local (deja fourni avec l'image disque table).
2. S'assurer que la cle de registre suivante existe :

```
HKEY_CLASSES_ROOT\invader
  (Default) = "URL:invader Protocol"
  URL Protocol = ""
HKEY_CLASSES_ROOT\invader\shell\open\command
  (Default) = "C:\Invader\InvaderLauncher.exe" "%1"
```

3. Au premier `invader://` Chrome demandera l'autorisation. Coche
   "Toujours autoriser ce site" pour eviter le prompt.

L'app frontend construit l'URL ainsi :

```
invader://launch?game=<id>&file=<filename>&library=<consoleLibrary>
```

Le launcher se charge ensuite de demarrer Retroarch / l'emulateur.

---

## 5. Retour focus apres une partie

Quand le jeu (Retroarch) prend la main, le browser passe en arriere-plan.
Quand le user maintient START 3s pour quitter, Retroarch se ferme et le
browser doit reprendre le focus.

Comportements attendus :

- **Master** : le browser repasse au premier plan. L'app detecte le
  retour via l'event `window.focus` (cf. `InGamePage.tsx`) et nettoie
  le `sessionStorage`. Le user peut taper "Terminer la partie" qui
  envoie un Pusher `end-game` au slave.
- **Slave** : reste en overlay "PARTIE EN COURS" jusqu'a reception du
  Pusher `end-game` (cf. `useSlaveGameSync`).

Pour s'assurer que le browser revient au premier plan :

```
[HKEY_CURRENT_USER\Control Panel\Desktop]
"ForegroundLockTimeout"=dword:00000000
```

> Sans ca, Windows clignote dans la barre des taches au lieu de focus.

Optionnellement, un script powershell `focus-chrome.ps1` peut etre
declenche au exit de Retroarch (via wrapper `.bat`) :

```powershell
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class W {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string n);
  }
"@
$h = (Get-Process chrome | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
[void][W]::SetForegroundWindow($h)
```

---

## 6. CTA event vers pages locales (quizz, battle, ...)

Les CTAs de la home screen pour les events en cours pointent vers des
URL definies en base via `events.cta_redirect_url`.

Cas typique : quand un quizz est en cours, le live event API renvoie
une URL du type :

```
http://localhost/quizz.php
```

Cette URL est servie par le MAMP/Apache local de la table (les anciens
fichiers `invader_table` / `invader_admin`). Pour que ca fonctionne :

- MAMP doit demarrer automatiquement avec Windows.
- Les vhosts/dossiers `htdocs` doivent contenir les pages :
  `quizz.php`, `battle.php`, `geoguesser.php`, `manoir.php`.
- Le port doit etre `80` (sinon adapter l'URL en base avec `:8888`).

> Si on veut pouvoir tester depuis un PC distant, il faut soit utiliser
> l'IP de la table en LAN, soit basculer ces pages sur un vrai
> domaine. Pour l'instant on reste sur localhost car chaque table a son
> MAMP local autonome.

---

## 7. Coupures reseau / mode degrade

L'interface tables :

- Tente un `heartbeat` (POST `/public/tables/:hostname/heartbeat`) toutes
  les ~30s. En cas d'echec, le PC est marque "offline" cote back-office.
- Continue de fonctionner en mode "offline-soft" pour la nav (les pages
  carte/jeux ont un cache local).
- Bloque l'envoi d'une commande si l'API n'est pas joignable (le user
  voit un message d'erreur dans le `CheckoutModal`).

En cas d'incident reseau prolonge, redemarrer Chrome (ou la machine).
Le hostname etant en localStorage, il est conserve.

---

## 8. Mise a jour de l'app

Aucune action sur la table : le frontend etant servi depuis Railway,
chaque deploiement est instantane. Au prochain refresh / autostart,
les tables prennent la nouvelle version.

Pour forcer une mise a jour sans toucher aux PC : depuis le back-office
`Tables tactiles > Bornes`, cliquer sur "Recharger" sur la ligne du
device. Un Pusher `reload` est envoye sur le canal de la table, la page
fait un `window.location.reload()`.

---

## 9. Recap commandes utiles

| Action | Commande |
|--------|----------|
| Lancer kiosque master | `chrome --kiosk "<URL>?hostname=TABLE01-1"` |
| Lancer kiosque slave  | `chrome --kiosk "<URL>?hostname=TABLE01-2"` |
| Reset hostname        | Vider `localStorage` ou repasser `?hostname=` |
| Force reload distant  | Back-office > Bornes > "Recharger" |
| Test custom protocol  | `start invader://launch?game=test`     |

---

## 10. Hostname check

Pour verifier que la table est bien identifiee, ouvrir la console
DevTools (F12 - desactiver kiosque temporairement) :

```js
localStorage.getItem('invader.hostname')
// => "TABLE01-1"
```

Et la ligne en bas du screensaver / overlay in-game affiche aussi le
hostname et le role (`master` / `slave`).

---

Fin du doc setup agent Windows.
