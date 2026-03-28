$ErrorActionPreference = 'Stop'
$NODE = "C:\Program Files\nodejs\node.exe"
$SCRIPTS = "C:\Users\maxim\OneDrive\Desktop\test claude\scripts"

$tasks = @(
    @{ Name="DevHub-Heartbeat";      Script="heartbeat.js";                    Trigger="repeat30" },
    @{ Name="DevHub-SocialMonitor";  Script="agents\social-monitor-agent.js";  Trigger="daily9am" },
    @{ Name="DevHub-JiraSync";       Script="agents\jira-sync-agent.js";       Trigger="repeat2h" },
    @{ Name="DevHub-Consolidation";  Script="agents\consolidation-agent.js";   Trigger="daily2am" },
    @{ Name="DevHub-TelegramBridge"; Script="telegram-bridge.js";              Trigger="startup"  }
)

foreach ($t in $tasks) {
    try {
        $action = New-ScheduledTaskAction -Execute $NODE -Argument "`"$SCRIPTS\$($t.Script)`"" -WorkingDirectory $SCRIPTS

        if ($t.Trigger -eq "repeat30") {
            $trigger = New-ScheduledTaskTrigger -Once -At "12:00AM" -RepetitionInterval (New-TimeSpan -Minutes 30)
        } elseif ($t.Trigger -eq "daily9am") {
            $trigger = New-ScheduledTaskTrigger -Daily -At "09:00AM"
        } elseif ($t.Trigger -eq "repeat2h") {
            $trigger = New-ScheduledTaskTrigger -Once -At "12:00AM" -RepetitionInterval (New-TimeSpan -Hours 2)
        } elseif ($t.Trigger -eq "daily2am") {
            $trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
        } elseif ($t.Trigger -eq "startup") {
            $trigger = New-ScheduledTaskTrigger -AtStartup
        }

        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskName $t.Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
        Write-Host "[OK]   $($t.Name)" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] $($t.Name): $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Registered tasks:" -ForegroundColor Cyan
Get-ScheduledTask | Where-Object { $_.TaskName -like "DevHub-*" } | Select-Object TaskName, State | Format-Table
