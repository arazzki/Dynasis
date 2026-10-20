param (
    [string]$Action = "toggle",
    [double]$Value = 0
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

    $session = $null
    $allSessions = $manager.GetSessions()
    if ($allSessions -and $allSessions.Count -gt 0) {
        foreach ($s in $allSessions) {
            try {
                $info = $s.GetPlaybackInfo()
                if ($info -and $info.PlaybackStatus.ToString() -eq 'Playing') {
                    $session = $s
                    break
                }
            } catch {}
        }
        if (-not $session) {
            $session = $manager.GetCurrentSession()
        }
        if (-not $session) {
            $session = $allSessions[0]
        }
    } else {
        $session = $manager.GetCurrentSession()
    }

    if ($session) {
        switch ($Action.ToLower()) {
            "play" { Await ($session.TryPlayAsync()) ([bool]) | Out-Null }
            "pause" { Await ($session.TryPauseAsync()) ([bool]) | Out-Null }
            "toggle" { Await ($session.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
            "next" { Await ($session.TrySkipNextAsync()) ([bool]) | Out-Null }
            "previous" { Await ($session.TrySkipPreviousAsync()) ([bool]) | Out-Null }
            "seek" {
                # Convert seconds to 100-nanosecond ticks
                $ticks = [long]([math]::Round($Value * 10000000))
                Await ($session.TryChangePlaybackPositionAsync($ticks)) ([bool]) | Out-Null
            }
        }
        '{"success": true}'
    } else {
        '{"success": false, "reason": "No active media session"}'
    }
} catch {
    '{"success": false, "error": "' + $_.Exception.Message + '"}'
}
