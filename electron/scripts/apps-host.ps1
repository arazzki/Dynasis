# Dynasis persistent apps-status host.
#
# Replaces spawning powershell.exe (and recompiling the Win32 helper via
# Add-Type) every 2 seconds. One process, compiled once, emits newline-delimited
# JSON on stdout only when the status snapshot actually changes.

param (
    [int]$IntervalMs = 3000
)

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

. (Join-Path $PSScriptRoot 'manage-apps-lib.ps1')

$script:lastJson = ''
$tick = 0

while ($true) {
    try {
        # Deep UIA browser-tab scan is the expensive part: run it every 3rd tick.
        $skipUia = ($tick % 3) -ne 0
        $payload = Get-AppsStatusPayload -SkipUia:$skipUia
        $tick++
        $json = $payload | ConvertTo-Json -Compress -Depth 4

        if ($json -ne $script:lastJson) {
            $script:lastJson = $json
            [Console]::Out.WriteLine($json)
            [Console]::Out.Flush()
        }

        # Main process self-terminates when SEB is detected; stop polling too.
        if ($payload -and $payload.sebDetected) {
            Start-Sleep -Milliseconds 250
            exit 0
        }
    } catch {
        $err = @{ sebDetected = $false; apps = @(); hostError = 'apps-host loop error' } | ConvertTo-Json -Compress -Depth 4
        if ($err -ne $script:lastJson) {
            $script:lastJson = $err
            [Console]::Out.WriteLine($err)
            [Console]::Out.Flush()
        }
    }

    Start-Sleep -Milliseconds $IntervalMs
}
