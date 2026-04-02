# Agent Bar — Installation et configuration

L'agent bar est un petit service Node.js qui tourne sur le PC master du bar.
Il se connecte au serveur invader_master via WebSocket et exécute les scripts
PowerShell locaux quand un administrateur déclenche une action depuis la page
"Gestion bar".

## Prérequis

- **Node.js 18+** installé sur le PC master
- **Git** pour cloner/mettre à jour le repo
- Le repo `invader_master` cloné sur le PC master

## 1. Installation

```powershell
cd C:\_DEV\INVADER\invader_master\agent
npm install
```

## 2. Configuration

Copier le fichier d'exemple et renseigner les valeurs :

```powershell
copy .env.example .env
```

Éditer `.env` :

```
INVADER_MASTER_WS_URL=wss://votre-domaine.com/ws/agent
BAR_AGENT_TOKEN=votre-token-secret
```

Le `BAR_AGENT_TOKEN` doit être le même que celui configuré dans le `.env` du
serveur `invader_master` (variable `BAR_AGENT_TOKEN`).

## 3. Scripts PowerShell

Les fichiers `.ps1` dans `agent/scripts/` sont des placeholders. Vous devez
y copier le contenu réel depuis `C:\RESSOURCES\SCRIPTS\ADMIN\` :

| Fichier agent           | Source originale                                 |
|-------------------------|--------------------------------------------------|
| `restart_pc.ps1`        | `C:\RESSOURCES\SCRIPTS\ADMIN\restart_pc.ps1`    |
| `restart_edge.ps1`      | `C:\RESSOURCES\SCRIPTS\ADMIN\restart_edge.ps1`  |
| `close_game.ps1`        | `C:\RESSOURCES\SCRIPTS\ADMIN\close_game.ps1`    |
| `clear_cache.ps1`       | `C:\RESSOURCES\SCRIPTS\ADMIN\clear_cache.ps1`   |
| `reset_slave_screen.ps1`| `C:\RESSOURCES\SCRIPTS\ADMIN\reset_slave_screen.ps1` |
| `restart_usb.ps1`       | `C:\RESSOURCES\SCRIPTS\ADMIN\restart_usb.ps1`   |
| `change_game.ps1`       | `C:\RESSOURCES\SCRIPTS\ADMIN\change_game.ps1`   |

Chaque script reçoit les paramètres `-TargetName` (ex: `TABLE03`, `BORNE01`)
et `-GameName` (optionnel, pour `change_game`).

## 4. Lancement en développement

```powershell
cd C:\_DEV\INVADER\invader_master\agent
npm run dev
```

Vous devriez voir :

```
[invader-agent] Starting bar agent...
[ws] Connecting to wss://...
[ws] Connected
```

## 5. Lancement automatique au démarrage de Windows

### Option A — Raccourci dans le dossier Startup (simple)

1. Créer un fichier `start-agent.bat` :

```bat
@echo off
cd /d C:\_DEV\INVADER\invader_master\agent
node dist/index.js
```

2. Compiler l'agent au préalable : `npm run build`

3. Placer un raccourci vers `start-agent.bat` dans :

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

Pour ouvrir ce dossier : `Win+R` → `shell:startup` → Entrée.

### Option B — Tâche planifiée (plus robuste)

```powershell
$action = New-ScheduledTaskAction `
  -Execute "node" `
  -Argument "dist/index.js" `
  -WorkingDirectory "C:\_DEV\INVADER\invader_master\agent"

$trigger = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName "InvaderBarAgent" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Agent WebSocket pour la gestion du bar Invader"
```

## 6. Mise à jour de l'agent

```powershell
cd C:\_DEV\INVADER\invader_master
git pull
cd agent
npm install
npm run build
```

Si l'agent tourne en tâche planifiée, le redémarrer après la mise à jour.
