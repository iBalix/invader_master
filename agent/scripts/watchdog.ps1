$tasks = @("InvaderAgent", "InvaderPingMonitor")

foreach ($name in $tasks) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($task -and $task.State -ne "Running") {
        Start-ScheduledTask -TaskName $name
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path "C:\Users\Administrateur\Desktop\invader_master\agent\logs\watchdog.log" -Value "$ts - RESTARTED $name (was: $($task.State))"
    }
}
