# Agent Bar — Installation et configuration

L'agent bar est un script PowerShell qui tourne sur le PC master du bar.
Il se connecte au serveur invader_master via WebSocket et exécute les scripts
PowerShell locaux quand un administrateur déclenche une action depuis la page
"Gestion bar".

Aucune dépendance externe nécessaire (pas de Node.js). PowerShell 5.1+ suffit.

## 1. Récupérer le code

Si le repo est déjà cloné sur le serveur :

```powershell
cd C:\Users\Administrateur\Desktop\invader_master
git pull
```

## 2. Configuration

Copier le fichier d'exemple et renseigner les valeurs :

```powershell
cd agent
copy .env.example .env
```

Éditer `agent\.env` :

```
INVADER_MASTER_WS_URL=wss://votre-domaine.com/ws/agent
BAR_AGENT_TOKEN=votre-token-secret
```

Le `BAR_AGENT_TOKEN` doit être le même que celui configuré dans le `.env` du
serveur `invader_master`.

## 3. Lancer l'agent pour tester

```powershell
cd C:\Users\Administrateur\Desktop\invader_master\agent
powershell -ExecutionPolicy Bypass -File invader-agent.ps1
```

Vous devriez voir :

```
[agent] Scripts autorises: restart_pc, restart_edge, close_game, ...
[ws] Connexion a wss://...
[ws] Connecte!
```

## 4. Lancement automatique au démarrage de Windows

### Option A — Raccourci dans le dossier Startup (simple)

Créer un fichier `start-agent.bat` sur le bureau :

```bat
@echo off
cd /d C:\Users\Administrateur\Desktop\invader_master\agent
powershell -ExecutionPolicy Bypass -NoProfile -File invader-agent.ps1
```

Placer un raccourci vers `start-agent.bat` dans :

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

Pour ouvrir ce dossier : `Win+R` → `shell:startup` → Entrée.

### Option B — Tâche planifiée (plus robuste)

```powershell
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -NoProfile -File invader-agent.ps1" `
  -WorkingDirectory "C:\Users\Administrateur\Desktop\invader_master\agent"

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

## 5. Mise à jour de l'agent

```powershell
cd C:\Users\Administrateur\Desktop\invader_master
git pull
```

Si l'agent tourne, le redémarrer après la mise à jour.
