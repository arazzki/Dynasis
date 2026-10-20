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
                $id = $s.SourceAppUserModelId
                if ($info -and $info.PlaybackStatus.ToString() -eq 'Playing' -and $id -match '(?i)spotify') {
                    $session = $s
                    break
                }
            } catch {}
        }
        if (-not $session) {
            foreach ($s in $allSessions) {
                try {
                    $info = $s.GetPlaybackInfo()
                    if ($info -and $info.PlaybackStatus.ToString() -eq 'Playing') {
                        $session = $s
                        break
                    }
                } catch {}
            }
        }
        if (-not $session) {
            foreach ($s in $allSessions) {
                try {
                    if ($s.SourceAppUserModelId -match '(?i)spotify') {
                        $session = $s
                        break
                    }
                } catch {}
            }
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
                $ticks = [long]([math]::Round($Value * 10000000))
                Await ($session.TryChangePlaybackPositionAsync($ticks)) ([bool]) | Out-Null
            }
        }
        '{"success": true}'
    } else {
        $act = $Action.ToLower()
        if ($act -eq "play" -or $act -eq "toggle") {
            # Launch Spotify if closed and request playback
            $spotifyCandidates = @(
                "$env:LOCALAPPDATA\Microsoft\WindowsApps\Spotify.exe",
                "$env:APPDATA\Spotify\Spotify.exe"
            )
            $launched = $false
            foreach ($sp in $spotifyCandidates) {
                if (Test-Path $sp) {
                    Start-Process -FilePath $sp
                    $launched = $true
                    break
                }
            }
            if (-not $launched) {
                Start-Process "spotify:"
            }

            # Poll up to 6 seconds for Spotify SMTC session or MainWindowHandle to come alive
            Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Media {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
            for ($i = 0; $i -lt 20; $i++) {
                Start-Sleep -Milliseconds 300
                $allSessions = $manager.GetSessions()
                if ($allSessions -and $allSessions.Count -gt 0) {
                    foreach ($s in $allSessions) {
                        if ($s.SourceAppUserModelId -match '(?i)spotify') {
                            Await ($s.TryPlayAsync()) ([bool]) | Out-Null
                            '{"success": true, "launched": true}'
                            exit 0
                        }
                    }
                }
                $spProc = Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
                if ($spProc -and $i -ge 4) {
                    # Send WM_APPCOMMAND (0x0319) with APPCOMMAND_MEDIA_PLAY_PAUSE (14 << 16 = 0xE0000) directly to Spotify window
                    [Win32Media]::PostMessage($spProc.MainWindowHandle, 0x0319, [IntPtr]::Zero, [IntPtr]0xE0000) | Out-Null
                    Start-Sleep -Milliseconds 400
                    '{"success": true, "launched": true}'
                    exit 0
                }
            }

            # Fallback: send hardware media Play/Pause key
            $wsh = New-Object -ComObject WScript.Shell
            $wsh.SendKeys([char]179)
            '{"success": true, "launched": true}'
        } else {
            '{"success": false, "reason": "No active media session"}'
        }
    }
} catch {
    '{"success": false, "error": "' + $_.Exception.Message + '"}'
}
