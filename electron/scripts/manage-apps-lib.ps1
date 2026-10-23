# Dynasis apps/apps-status library.
#
# Shared by:
#   manage-apps.ps1  -> one-shot status / action (invoked on user click)
#   apps-host.ps1    -> long-lived status poller (one process, no spawn churn)
#
# Must not write anything to stdout: callers own the output stream.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue

if (-not ('Win32AppManager' -as [type])) {
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

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

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

    public static List<IntPtr> GetBrowserHwnds() {
        var list = new List<IntPtr>();
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            var cb = new StringBuilder(64);
            GetClassName(hWnd, cb, 64);
            string cls = cb.ToString();
            if (cls == "Chrome_WidgetWin_1" || cls == "MozillaWindowClass") {
                int len = GetWindowTextLength(hWnd);
                if (len <= 0) return true;
                var sb = new StringBuilder(len + 1);
                GetWindowText(hWnd, sb, sb.Capacity);
                string title = sb.ToString().Trim();
                if (!string.IsNullOrEmpty(title) &&
                    title.IndexOf("Dynasis", StringComparison.OrdinalIgnoreCase) < 0 &&
                    title.IndexOf("Antigravity", StringComparison.OrdinalIgnoreCase) < 0 &&
                    title.IndexOf("Visual Studio Code", StringComparison.OrdinalIgnoreCase) < 0 &&
                    title.IndexOf("Spotify", StringComparison.OrdinalIgnoreCase) < 0 &&
                    title.IndexOf("Discord", StringComparison.OrdinalIgnoreCase) < 0) {
                    list.Add(hWnd);
                }
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
}

$script:winTitles = @{}
$script:waWebTabOpen = $false
$script:waTabUnread = 0

function Get-LatestWhatsAppNotification {
    param([switch]$SkipUia)

    $latestToast = $null

    # 1. Check Windows Action Center Toast Notifications (Chrome, Opera GX, Edge, Brave, Firefox, or WhatsApp)
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
                    $aumid = ""
                    try { $appName = $n.AppInfo.DisplayInfo.DisplayName } catch {}
                    try { $aumid = $n.AppInfo.AppUserModelId } catch {}
                    # Ignore IDE / system utility notifications
                    if ($appName -match '(?i)^(Antigravity|Snipping Tool|Windows Security|PowerShell)$' -or
                        $aumid -match '(?i)(Antigravity|ScreenSketch|SecurityCenter)') {
                        continue
                    }
                    $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
                    if ($binding) {
                        $texts = @($binding.GetTextElements() | ForEach-Object { $_.Text } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
                        $joined = ($texts -join " ")
                        $isWhatsAppApp = ($appName -match '(?i)whatsapp') -or ($aumid -match '(?i)whatsapp')
                        $isWhatsAppWeb = $joined -match '(?i)(whatsapp\.com|whatsapp\s*web|whatsapp)'
                        if ($isWhatsAppApp -or $isWhatsAppWeb) {
                            $script:waWebTabOpen = $true
                            $cleanTexts = @($texts | Where-Object { $_ -notmatch '(?i)^(https?://)?(web\.)?whatsapp\.com/?$' -and $_ -notmatch '(?i)^WhatsApp\s*Web$' })
                            $sender = if ($cleanTexts.Count -ge 1) { $cleanTexts[0] } else { "WhatsApp Web" }
                            $msg = if ($cleanTexts.Count -ge 2) { ($cleanTexts[1..($cleanTexts.Count - 1)] -join " ") } elseif ($cleanTexts.Count -eq 1) { $cleanTexts[0] } else { "Pesan baru masuk" }
                            if ($cleanTexts.Count -eq 1) { $sender = "WhatsApp Web" }
                            $latestToast = @{
                                hasNotif = $true
                                id = "toast_$($n.Id)"
                                sender = $sender
                                message = $msg
                                source = "WhatsApp Web"
                            }
                            break
                        }
                    }
                }
            }
        }
    } catch {}

    # 2. Always check visible window titles AND background browser tabs (Chrome, Opera GX, Edge, Brave, Firefox) via UIAutomation
    try {
        $candidateTitles = New-Object System.Collections.Generic.List[string]
        foreach ($wt in [Win32AppManager]::GetAllVisibleWindowTitles()) {
            $candidateTitles.Add($wt)
        }

        $tabCondition = New-Object System.Windows.Automation.OrCondition(
            (New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::TabItem
            )),
            (New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Document
            ))
        )

        if (-not $SkipUia) {
            foreach ($h in [Win32AppManager]::GetBrowserHwnds()) {
                try {
                    $el = [System.Windows.Automation.AutomationElement]::FromHandle($h)
                    if ($el) {
                        $tabs = $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
                        foreach ($tab in $tabs) {
                            $tName = $tab.Current.Name
                            if (-not [string]::IsNullOrWhiteSpace($tName)) {
                                $candidateTitles.Add($tName)
                            }
                        }
                    }
                } catch {}
            }
        }

        $maxUnread = 0
        foreach ($t in $candidateTitles) {
            if ($t -match '(?i)WhatsApp') {
                $script:waWebTabOpen = $true
            }
            if ($t -match '\((\d+)\)\s*WhatsApp') {
                $unreadCount = [int]$Matches[1]
                if ($unreadCount -gt $maxUnread) {
                    $maxUnread = $unreadCount
                }
            }
        }

        if ($SkipUia) {
            # Keep the last deep-scan value so unread counts do not flap to 0
            # between deep scans (that would replay notifications).
            if ($maxUnread -gt $script:waTabUnread) {
                $script:waTabUnread = $maxUnread
            }
        } else {
            $script:waTabUnread = $maxUnread
        }
    } catch {}

    if ($latestToast) {
        return $latestToast
    }
    if ($script:waTabUnread -gt 0) {
        return @{
            hasNotif = $true
            id = "title_unread_$($script:waTabUnread)"
            sender = "WhatsApp Web"
            message = "$($script:waTabUnread) pesan baru belum dibaca di WhatsApp Web"
            source = "WhatsApp Web"
        }
    }
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

# Full status snapshot consumed by both the one-shot script and the long-lived host.
function Get-AppsStatusPayload {
    param([switch]$SkipUia)

    $script:winTitles = [Win32AppManager]::GetTopWindowTitles()
    if (-not $SkipUia) {
        $script:waWebTabOpen = $false
        $script:waTabUnread = 0
    }

    # Check if Safe Exam Browser (SEB) GUI/Client is actually open (ignore 24/7 SafeExamBrowser.Service!)
    $sebProcs = Get-Process -Name "SafeExamBrowser", "SafeExamBrowser.Client" -ErrorAction SilentlyContinue
    if ($sebProcs) {
        return @{
            sebDetected = $true
            apps = @()
            activeApp = "SafeExamBrowser"
            activeTitle = "SEB Exam Mode"
            waNotif = $null
            waTabUnread = 0
            waWebTabOpen = $false
        }
    }

    $discord = Get-AppSummary "discord" "Discord" @("Discord")
    $spotify = Get-AppSummary "spotify" "Spotify" @("Spotify")
    $browser = Get-AppSummary "browser" "Browser" @("chrome", "opera", "msedge", "brave", "firefox")
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

    $waNotif = Get-LatestWhatsAppNotification -SkipUia:$SkipUia

    return @{
        sebDetected = $false
        activeApp = $activeAppName
        activeTitle = $activeAppTitle
        apps = @($spotify, $discord, $browser, $vscode)
        waNotif = $waNotif
        waTabUnread = $script:waTabUnread
        waWebTabOpen = $script:waWebTabOpen
    }
}
