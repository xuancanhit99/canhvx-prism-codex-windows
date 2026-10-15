param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'

function Get-CodexDesktop {
    @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'" |
        Where-Object {
            $_.CommandLine -notmatch '--type(?:=|\s)' -and
            $_.ExecutablePath -match '\\(?:WindowsApps\\OpenAI\.Codex_[^\\]+\\app|Programs\\(?:OpenAI\\)?Codex(?:\\app)?|Program Files(?: \(x86\))?\\Codex(?:\\app)?)\\(?:ChatGPT|Codex)\.exe$'
        })
}

function Get-DebugPort($Desktop) {
    $portMatch = [regex]::Match($Desktop.CommandLine, '(?:^|\s)--remote-debugging-port(?:=|\s+)(\d+)')
    if ($portMatch.Success -and [int]$portMatch.Groups[1].Value -gt 0 -and [int]$portMatch.Groups[1].Value -le 65535) {
        return [int]$portMatch.Groups[1].Value
    }
    return 0
}

function Test-CodexEndpoint([int]$Port) {
    if (!$Port) { return $false }
    try {
        $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
        return [bool]($targets | Where-Object { $_.type -eq 'page' -and $_.url -eq 'app://-/index.html' -and $_.webSocketDebuggerUrl })
    } catch { return $false }
}

try {
    $desktops = @(Get-CodexDesktop)
    if ($desktops.Count -gt 1) { throw 'Multiple Codex desktop instances detected. No app was started.' }
    $debugPort = if ($desktops.Count) { Get-DebugPort $desktops[0] } else { 0 }
    if ($CheckOnly) {
        [pscustomobject]@{
            DesktopRunning = [bool]$desktops.Count
            LocalControlEnabled = [bool]$debugPort
            LocalControlReachable = Test-CodexEndpoint $debugPort
            HubRunning = [bool](Get-Process -Name prism-hub-desktop -ErrorAction SilentlyContinue)
        }
        return
    }
    if ($desktops.Count -and !$debugPort) {
        throw 'Codex is already open without local control. Close Codex normally, then open the Codex + Prism shortcut. Nothing was closed or restarted.'
    }
    if (!$desktops.Count) {
        $package = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
        $app = if ($package) { Join-Path $package.InstallLocation 'app\ChatGPT.exe' }
        if (!$app -or !(Test-Path -LiteralPath $app)) { throw 'Microsoft Store Codex installation was not found.' }
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        try { $debugPort = $listener.LocalEndpoint.Port } finally { $listener.Stop() }
        Start-Process -FilePath $app -ArgumentList @('--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$debugPort") -WindowStyle Hidden
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        if (Test-CodexEndpoint $debugPort) { $ready = $true; break }
        Start-Sleep -Milliseconds 800
    }
    if (!$ready) { throw 'Codex did not expose its local control endpoint. No existing app was terminated.' }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $debugPort -ErrorAction Stop)
    $current = @(Get-CodexDesktop)
    if ($current.Count -ne 1 -or !$listeners.Count -or
        @($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') -or $_.OwningProcess -ne $current[0].ProcessId }).Count) {
        throw 'Local control endpoint ownership or loopback binding could not be verified.'
    }
    if (Get-Process -Name prism-hub-desktop -ErrorAction SilentlyContinue) {
        $null = Invoke-RestMethod -Uri 'http://127.0.0.1:17171/api/lifecycle' -Method Post -ContentType 'application/json' -Body '{"action":"restart"}' -TimeoutSec 10
    } else {
        $hub = Join-Path $env:LOCALAPPDATA 'Prism Hub\prism-hub-desktop.exe'
        if (!(Test-Path -LiteralPath $hub)) { throw 'Prism Hub executable was not found.' }
        Start-Process -FilePath $hub -WindowStyle Hidden
    }
} catch {
    if ($CheckOnly) { throw }
    $null = (New-Object -ComObject WScript.Shell).Popup($_.Exception.Message, 0, 'Codex + Prism', 48)
    exit 1
}
