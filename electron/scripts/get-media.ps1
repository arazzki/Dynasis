param (
    [string]$LastTrackKey = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { 
    $_.Name -eq 'AsTask' -and 
    $_.GetParameters().Count -eq 1 -and 
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' 
})[0]

$asStreamMethod = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsStreamForRead' -and
    $_.GetParameters().Count -eq 1
})[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

try {
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

    $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $manager = Await $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

    # Priority: 1) Playing Spotify session, 2) Any Playing session, 3) Paused Spotify session, 4) GetCurrentSession(), 5) First session
    $session = $null
    $allSessions = $manager.GetSessions()
    if ($allSessions -and $allSessions.Count -gt 0) {
        # 1. Playing Spotify session
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
        # 2. Any Playing session
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
        # 3. Any Spotify session (even if Paused)
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
        # 4. Fallback to GetCurrentSession or first session
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
        $mediaPropsOp = $session.TryGetMediaPropertiesAsync()
        $mediaProps = Await $mediaPropsOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $playbackInfo = $session.GetPlaybackInfo()

        $duration = 0
        $position = 0
        try {
            $timeline = $session.GetTimelineProperties()
            if ($timeline) {
                $durSec = ($timeline.EndTime - $timeline.StartTime).TotalSeconds
                $posSec = ($timeline.Position - $timeline.StartTime).TotalSeconds
                if ($durSec -gt 0) { $duration = [math]::Round($durSec, 1) }
                if ($posSec -ge 0) { $position = [math]::Round($posSec, 1) }
            }
        } catch {}

        $trackKey = "$($mediaProps.Title)|$($mediaProps.Artist)"
        $albumArt = $null
        $albumArtCached = $false

        if ($LastTrackKey -ne "" -and $LastTrackKey -eq $trackKey) {
            $albumArtCached = $true
        } else {
            try {
                if ($mediaProps.Thumbnail) {
                    $stream = Await ($mediaProps.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                    $netStream = $asStreamMethod.Invoke($null, @($stream))
                    $ms = New-Object System.IO.MemoryStream
                    $netStream.CopyTo($ms)
                    $albumArt = "data:image/png;base64," + [Convert]::ToBase64String($ms.ToArray())
                    $ms.Dispose()
                    $netStream.Dispose()
                }
            } catch {
                $albumArt = $null
            }
        }

        $appId = ""
        try {
            $appId = $session.SourceAppUserModelId
        } catch {}

        $result = @{
            hasMedia = $true
            trackKey = $trackKey
            title = $mediaProps.Title
            artist = $mediaProps.Artist
            albumTitle = $mediaProps.AlbumTitle
            albumArt = $albumArt
            albumArtCached = $albumArtCached
            status = $playbackInfo.PlaybackStatus.ToString()
            duration = $duration
            position = $position
            appId = $appId
        }
        $result | ConvertTo-Json -Compress
    } else {
        '{"hasMedia": false}'
    }
} catch {
    '{"hasMedia": false, "error": "' + $_.Exception.Message + '"}'
}
