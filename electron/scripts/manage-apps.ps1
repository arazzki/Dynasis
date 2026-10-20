param (
    [string]$Mode = "status",
    [string]$Target = "",
    [string]$Command = "open"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class Win32AppManager {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    public static Dictionary<uint, string> GetTopWindowTitles() {
        var map = new Dictionary<uint, string>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString().Trim();
            if (string.IsNullOrEmpty(title)) return true;
            uint pid = 0;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid != 0 && !map.ContainsKey(pid)) {
                map[pid] = title;
            }
            return true;
        }, IntPtr.Zero);
        return map;
    }

    public static IntPtr FindWindowForPids(uint[] pids) {
        var pidSet = new HashSet<uint>(pids);
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            uint pid = 0;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pidSet.Contains(pid)) {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
    public static List<string> GetAllVisibleWindowTitles() {
        var list = new List<string>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString().Trim();
            if (!string.IsNullOrEmpty(title)) {
                list.Add(title);
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static IntPtr FindWindowByTitlePattern(string keyword) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            int len = GetWindowTextLength(hWnd);
            if (len <= 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString().Trim();
            if (title.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0) {
                found = hWnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
"@

$script:winTitles = [Win32AppManager]::GetTopWindowTitles()

function Get-LatestWhatsAppNotification {
    try {
        $null = [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime]
        $null = [Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime]
        $null = [Windows.UI.Notifications.KnownNotificationBindings, Windows.UI.Notifications, ContentType = WindowsRuntime]
        Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue

        $listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
        if ($listener.GetAccessStatus() -eq 'Allowed') {
            $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
                $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
            })[0]
            $op = $listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)
            $resType = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]
            $task = $asTaskGeneric.MakeGenericMethod($resType).Invoke($null, @($op))
            $task.Wait(1200) | Out-Null
            if ($task.IsCompleted -and $task.Result) {
                $notifs = $task.Result
                for ($i = $notifs.Count - 1; $i -ge [Math]::Max(0, $notifs.Count - 15); $i--) {
                    $n = $notifs[$i]
                    $appName = ""
                    try { $appName = $n.AppInfo.DisplayInfo.DisplayName } catch {}
                    # Ignore IDE / system utility notifications
                    if ($appName -match '(?i)^(Antigravity|Snipping Tool|Windows Security|PowerShell)$') {
                        continue
                    }
                    $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
                    if ($binding) {
                        $texts = @($binding.GetTextElements() | ForEach-Object { $_.Text } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
                        $joined = ($texts -join " ")
                        $isWhatsAppApp = $appName -match '(?i)whatsapp'
                        $isWhatsAppWeb = $joined -match '(?i)(whatsapp\.com|whatsapp\s*web|whatsapp)'
                        if ($isWhatsAppApp -or $isWhatsAppWeb) {
                            # Filter out domain text like "web.whatsapp.com" to extract Sender & Message
                            $cleanTexts = @($texts | Where-Object { $_ -notmatch '(?i)^(https?://)?(web\.)?whatsapp\.com/?$' })
                            $sender = if ($cleanTexts.Count -ge 1) { $cleanTexts[0] } else { "WhatsApp Web" }
                            $msg = if ($cleanTexts.Count -ge 2) { ($cleanTexts[1..($cleanTexts.Count - 1)] -join " ") } elseif ($cleanTexts.Count -eq 1) { $cleanTexts[0] } else { "Pesan baru masuk" }
                            if ($cleanTexts.Count -eq 1) { $sender = "WhatsApp" }
                            return @{
                                hasNotif = $true
                                id = "toast_$($n.Id)"
                                sender = $sender
                                message = $msg
                                source = if ($isWhatsAppApp) { "WhatsApp" } else { "WhatsApp Web" }
                            }
                        }
                    }
                }
            }
        }
    } catch {}

    # Fallback: Check visible browser window titles for "(N) WhatsApp"
    try {
        $allTitles = [Win32AppManager]::GetAllVisibleWindowTitles()
        foreach ($t in $allTitles) {
            if ($t -match '\((\d+)\)\s*WhatsApp') {
                $unreadCount = [int]$Matches[1]
                if ($unreadCount -gt 0) {
                    return @{
                        hasNotif = $true
                        id = "title_unread_$unreadCount"
                        sender = "WhatsApp Web"
                        message = "$unreadCount pesan belum dibaca di WhatsApp Web"
                        source = "WhatsApp Web"
                    }
                }
            }
        }
    } catch {}

    return $null
}

function Focus-ProcessWindow($procNames) {
    $procs = Get-Process -Name $procNames -ErrorAction SilentlyContinue
    if (-not $procs) { return $false }

    $hwnd = [IntPtr]::Zero
    $withMain = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($withMain) {
        $hwnd = $withMain.MainWindowHandle
    } else {
        $pids = [uint32[]]($procs | ForEach-Object { [uint32]$_.Id })
        $hwnd = [Win32AppManager]::FindWindowForPids($pids)
    }

    if ($hwnd -ne [IntPtr]::Zero) {
        if ([Win32AppManager]::IsIconic($hwnd)) {
            [Win32AppManager]::ShowWindowAsync($hwnd, 9) | Out-Null # SW_RESTORE
        } else {
            [Win32AppManager]::ShowWindowAsync($hwnd, 5) | Out-Null # SW_SHOW
        }
        [Win32AppManager]::SetForegroundWindow($hwnd) | Out-Null
        return $true
    }
    return $false
}

function Get-AppSummary($id, $name, $procNames) {
    $procs = Get-Process -Name $procNames -ErrorAction SilentlyContinue
    if (-not $procs) {
        return @{
            id = $id
            name = $name
            isRunning = $false
            windowTitle = ""
        }
    }
    $title = ""
    foreach ($p in $procs) {
        if (-not [string]::IsNullOrWhiteSpace($p.MainWindowTitle)) {
            $title = $p.MainWindowTitle
            break
        }
        if ($script:winTitles.ContainsKey([uint32]$p.Id)) {
            $title = $script:winTitles[[uint32]$p.Id]
            break
        }
    }
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = "$name aktif di sistem"
    }
    return @{
        id = $id
        name = $name
        isRunning = $true
        windowTitle = $title
    }
}

if ($Mode -eq "status") {
    # Check if Safe Exam Browser (SEB) GUI/Client is actually open (ignore 24/7 SafeExamBrowser.Service!)
    $sebProcs = Get-Process -Name "SafeExamBrowser", "SafeExamBrowser.Client" -ErrorAction SilentlyContinue
    if ($sebProcs) {
        @{ sebDetected = $true; apps = @(); activeApp = "SafeExamBrowser"; activeTitle = "SEB Exam Mode" } | ConvertTo-Json -Compress
        exit 0
    }

    $discord = Get-AppSummary "discord" "Discord" @("Discord")
    $spotify = Get-AppSummary "spotify" "Spotify" @("Spotify")
    $browser = Get-AppSummary "browser" "Browser" @("chrome", "msedge", "brave", "firefox")
    $vscode  = Get-AppSummary "vscode" "VS Code" @("Code")

    $activeAppName = ""
    $activeAppTitle = ""
    try {
        $fgHwnd = [Win32AppManager]::GetForegroundWindow()
        if ($fgHwnd -ne [IntPtr]::Zero) {
            $fgPid = [uint32]0
            [Win32AppManager]::GetWindowThreadProcessId($fgHwnd, [ref]$fgPid) | Out-Null
            if ($fgPid -gt 0) {
                $fgProc = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
                if ($fgProc -and $fgProc.ProcessName -notmatch '(?i)^(dynasis|electron)$') {
                    $activeAppName = $fgProc.ProcessName
                    $activeAppTitle = if ($script:winTitles.ContainsKey($fgPid)) { $script:winTitles[$fgPid] } else { $fgProc.MainWindowTitle }
                }
            }
        }
    } catch {}

    $waNotif = Get-LatestWhatsAppNotification

    $result = @{
        sebDetected = $false
        activeApp = $activeAppName
        activeTitle = $activeAppTitle
        apps = @($spotify, $discord, $browser, $vscode)
        waNotif = $waNotif
    }
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
        if (-not (Focus-ProcessWindow @("WhatsApp", "chrome", "msedge", "brave", "firefox"))) {
            Start-Process "https://web.whatsapp.com"
        }
        '{"success": true, "action": "opened_whatsapp"}'
        exit 0
    }

    if ($t -eq "browser") {
        if (-not (Focus-ProcessWindow @("chrome", "msedge", "brave", "firefox"))) {
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
