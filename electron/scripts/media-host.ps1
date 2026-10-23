# Dynasis persistent media host.
#
# Runs as ONE long-lived process instead of spawning powershell.exe every
# 1.2 seconds. Emits newline-delimited JSON on stdout only when the SMTC state
# actually changes, so the Electron main process can simply read lines.
#
# Protocol: one JSON object per line, same shape as the legacy get-media.ps1.
# stdout must stay clean: only JSON lines are written there.

param (
    [int]$IntervalMs = 900
)

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
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
} catch {
    # Cannot use WinRT at all: emit one "no media" line and stay alive so the
    # main process does not restart us in a tight loop.
    [Console]::Out.WriteLine('{"hasMedia":false}')
    [Console]::Out.Flush()
    while ($true) { Start-Sleep -Milliseconds 5000 }
}

$script:lastTrackKey = ''
$script:albumArtCache = $null
$script:lastJson = ''

function Get-PreferredSession($manager) {
    $allSessions = $manager.GetSessions()
    if (-not $allSessions -or $allSessions.Count -eq 0) {
        return $manager.GetCurrentSession()
    }

    # 1. Playing Spotify session
    foreach ($s in $allSessions) {
        try {
            $info = $s.GetPlaybackInfo()
            if ($info -and $info.PlaybackStatus.ToString() -eq 'Playing' -and $s.SourceAppUserModelId -match '(?i)spotify') {
                return $s
            }
        } catch {}
    }
    # 2. Any playing session
    foreach ($s in $allSessions) {
        try {
            $info = $s.GetPlaybackInfo()
            if ($info -and $info.PlaybackStatus.ToString() -eq 'Playing') {
                return $s
            }
        } catch {}
    }
    # 3. Any Spotify session (even paused)
    foreach ($s in $allSessions) {
        try {
            if ($s.SourceAppUserModelId -match '(?i)spotify') {
                return $s
            }
        } catch {}
    }
    # 4. Current / first session
    $current = $manager.GetCurrentSession()
    if ($current) { return $current }
    return $allSessions[0]
}

function Build-MediaState($manager) {
    $session = Get-PreferredSession $manager
    if (-not $session) {
        $script:lastTrackKey = ''
        $script:albumArtCache = $null
        return @{ hasMedia = $false } | ConvertTo-Json -Compress
    }

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

    $title = $mediaProps.Title
    $artist = $mediaProps.Artist
    $trackKey = "$title|$artist"
    $albumArt = $null
    $albumArtCached = $false

    if ($script:lastTrackKey -ne '' -and $script:lastTrackKey -eq $trackKey -and $script:albumArtCache) {
        # Send the cached bytes only once; the main process keeps the last copy.
        $albumArtCached = $true
    } else {
        $script:lastTrackKey = $trackKey
        try {
            if ($mediaProps.Thumbnail) {
                $stream = Await ($mediaProps.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                $netStream = $asStreamMethod.Invoke($null, @($stream))
                $ms = New-Object System.IO.MemoryStream
                $netStream.CopyTo($ms)
                $albumArt = 'data:image/png;base64,' + [Convert]::ToBase64String($ms.ToArray())
                $script:albumArtCache = $albumArt
                $ms.Dispose()
                $netStream.Dispose()
            } else {
                $script:albumArtCache = $null
            }
        } catch {
            $albumArt = $null
        }
    }

    $appId = ''
    try { $appId = $session.SourceAppUserModelId } catch {}

    return @{
        hasMedia = $true
        trackKey = $trackKey
        title = $title
        artist = $artist
        albumTitle = $mediaProps.AlbumTitle
        albumArt = $albumArt
        albumArtCached = $albumArtCached
        status = $playbackInfo.PlaybackStatus.ToString()
        duration = $duration
        position = $position
        appId = $appId
    } | ConvertTo-Json -Compress
}

while ($true) {
    try {
        $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
        $manager = Await $asyncOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
        if (-not $manager) { throw 'No SMTC manager' }

        $json = Build-MediaState $manager
        if ($json -ne $script:lastJson) {
            $script:lastJson = $json
            [Console]::Out.WriteLine($json)
            [Console]::Out.Flush()
        }
    } catch {
        $err = @{
            hasMedia = $false
            error = 'media-host loop error'
        } | ConvertTo-Json -Compress
        if ($err -ne $script:lastJson) {
            $script:lastJson = $err
            [Console]::Out.WriteLine($err)
            [Console]::Out.Flush()
        }
    }

    Start-Sleep -Milliseconds $IntervalMs
}
