param (
    [string]$Mode = "status",
    [string]$Target = "",
    [string]$Command = "open"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

. (Join-Path $PSScriptRoot 'manage-apps-lib.ps1')

if ($Mode -eq "status") {
    $result = Get-AppsStatusPayload
    $result | ConvertTo-Json -Compress -Depth 4
    exit 0
}

if ($Mode -eq "action") {
    $t = $Target.ToLower()
    $c = $Command.ToLower()

    if ($t -eq "spotify") {
        $spRunning = Get-Process -Name Spotify -ErrorAction SilentlyContinue
        if (-not $spRunning) {
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

            if ($c -eq "play") {
                for ($i = 0; $i -lt 20; $i++) {
                    Start-Sleep -Milliseconds 300
                    $spProcs = Get-Process -Name Spotify -ErrorAction SilentlyContinue
                    if ($spProcs -and $i -ge 4) {
                        $pids = [uint32[]]($spProcs | ForEach-Object { [uint32]$_.Id })
                        $hwnd = [Win32AppManager]::FindWindowForPids($pids)
                        if ($hwnd -ne [IntPtr]::Zero) {
                            [Win32AppManager]::PostMessage($hwnd, 0x0319, [IntPtr]::Zero, [IntPtr]0xE0000) | Out-Null
                            break
                        }
                    }
                }
            }
            '{"success": true, "action": "launched_spotify"}'
            exit 0
        } else {
            if ($c -eq "play") {
                $pids = [uint32[]]($spRunning | ForEach-Object { [uint32]$_.Id })
                $hwnd = [Win32AppManager]::FindWindowForPids($pids)
                if ($hwnd -ne [IntPtr]::Zero) {
                    [Win32AppManager]::PostMessage($hwnd, 0x0319, [IntPtr]::Zero, [IntPtr]0xE0000) | Out-Null
                } else {
                    (New-Object -ComObject WScript.Shell).SendKeys([char]179)
                }
            } else {
                if (-not (Focus-ProcessWindow @("Spotify"))) {
                    $spPath = "$env:LOCALAPPDATA\Microsoft\WindowsApps\Spotify.exe"
                    if (Test-Path $spPath) { Start-Process -FilePath $spPath } else { Start-Process "spotify:" }
                }
            }
            '{"success": true, "action": "focused_spotify"}'
            exit 0
        }
    }

    if ($t -eq "discord") {
        if ($c -eq "mute") {
            $wsh = New-Object -ComObject WScript.Shell
            $wsh.SendKeys("^+m")
            '{"success": true, "action": "discord_mute"}'
            exit 0
        }
        if (-not (Focus-ProcessWindow @("Discord"))) {
            $discordUpdater = "$env:LOCALAPPDATA\Discord\Update.exe"
            if (Test-Path $discordUpdater) {
                Start-Process -FilePath $discordUpdater -ArgumentList "--processStart", "Discord.exe"
            } else {
                Start-Process "discord://"
            }
        }
        '{"success": true, "action": "opened_discord"}'
        exit 0
    }

    if ($t -eq "whatsapp") {
        # 1. Check if active window title already contains WhatsApp
        $waHwnd = [Win32AppManager]::FindWindowByTitlePattern("WhatsApp")
        if ($waHwnd -ne [IntPtr]::Zero) {
            if ([Win32AppManager]::IsIconic($waHwnd)) {
                [Win32AppManager]::ShowWindowAsync($waHwnd, 9) | Out-Null
            } else {
                [Win32AppManager]::ShowWindowAsync($waHwnd, 5) | Out-Null
            }
            [Win32AppManager]::SetForegroundWindow($waHwnd) | Out-Null
            '{"success": true, "action": "focused_whatsapp"}'
            exit 0
        }

        # 2. Check background browser tabs in Chrome / Opera GX / Edge / Brave / Firefox for WhatsApp Web
        try {
            $tabCondition = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::TabItem
            )
            foreach ($h in [Win32AppManager]::GetBrowserHwnds()) {
                $el = [System.Windows.Automation.AutomationElement]::FromHandle($h)
                if ($el) {
                    $tabs = $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
                    foreach ($tab in $tabs) {
                        if ($tab.Current.Name -match '(?i)WhatsApp') {
                            if ([Win32AppManager]::IsIconic($h)) {
                                [Win32AppManager]::ShowWindowAsync($h, 9) | Out-Null
                            } else {
                                [Win32AppManager]::ShowWindowAsync($h, 5) | Out-Null
                            }
                            [Win32AppManager]::SetForegroundWindow($h) | Out-Null
                            try {
                                $selPattern = $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
                                if ($selPattern) { $selPattern.Select() }
                            } catch {
                                try {
                                    $invPattern = $tab.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                                    if ($invPattern) { $invPattern.Invoke() }
                                } catch {}
                            }
                            '{"success": true, "action": "focused_whatsapp_tab"}'
                            exit 0
                        }
                    }
                }
            }
        } catch {}

        # 3. Otherwise open web.whatsapp.com directly in the user's browser
        Start-Process "https://web.whatsapp.com"
        '{"success": true, "action": "opened_whatsapp_web"}'
        exit 0
    }

    if ($t -eq "browser") {
        if (-not (Focus-ProcessWindow @("chrome", "opera", "msedge", "brave", "firefox"))) {
            Start-Process "https://www.google.com"
        }
        '{"success": true, "action": "opened_browser"}'
        exit 0
    }

    if ($t -eq "vscode") {
        if (-not (Focus-ProcessWindow @("Code"))) {
            Start-Process "code" -ErrorAction SilentlyContinue
        }
        '{"success": true, "action": "opened_vscode"}'
        exit 0
    }

    if ($t -eq "system") {
        $wsh = New-Object -ComObject WScript.Shell
        switch ($c) {
            "vol-up"   { $wsh.SendKeys([char]175) }
            "vol-down" { $wsh.SendKeys([char]174) }
            "vol-mute" { $wsh.SendKeys([char]173) }
        }
        '{"success": true, "action": "volume_changed"}'
        exit 0
    }
}

'{"success": false}'
