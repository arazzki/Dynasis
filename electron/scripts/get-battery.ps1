try {
    $battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
    if ($battery) {
        # BatteryStatus: 1=Discharging, 2=Unknown/AC, 3=Fully Charged, 4=Low, 5=Critical, 6=Charging, 7=Charging and High, 8=Charging and Low
        $isCharging = ($battery.BatteryStatus -eq 2 -or $battery.BatteryStatus -eq 3 -or $battery.BatteryStatus -eq 6 -or $battery.BatteryStatus -eq 7 -or $battery.BatteryStatus -eq 8)
        $status = @{
            hasBattery = $true
            level = [int]$battery.EstimatedChargeRemaining
            isCharging = [bool]$isCharging
        }
        $status | ConvertTo-Json -Compress
    } else {
        '{"hasBattery": false}'
    }
} catch {
    '{"hasBattery": false}'
}
