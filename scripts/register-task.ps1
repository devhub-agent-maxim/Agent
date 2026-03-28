$action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" -Argument "`"C:\Users\maxim\OneDrive\Desktop\test claude\scripts\heartbeat.js`""
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 30) -Once -At "12:00AM"
Register-ScheduledTask -TaskName "DevHub-Heartbeat" -Action $action -Trigger $trigger -Force
Write-Host "SUCCESS: Heartbeat scheduled every 30 minutes"
