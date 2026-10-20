param (
    [string]$Action = "toggle"
)

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsTask' -and 
    $_.GetParameters().Count -eq 1 -and 
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
})[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

try {
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
    $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $manager = Await $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $session = $manager.GetCurrentSession()

    if ($session) {
        switch ($Action.ToLower()) {
            "play" { $session.TryPlayAsync() | Out-Null }
            "pause" { $session.TryPauseAsync() | Out-Null }
            "toggle" { $session.TryTogglePlayPauseAsync() | Out-Null }
            "next" { $session.TrySkipNextAsync() | Out-Null }
            "previous" { $session.TrySkipPreviousAsync() | Out-Null }
        }
        '{"success": true}'
    } else {
        '{"success": false, "reason": "No active media session"}'
    }
} catch {
    '{"success": false, "error": "' + $_.Exception.Message + '"}'
}
