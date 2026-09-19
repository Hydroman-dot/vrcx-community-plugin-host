param(
    [ValidateSet('Install','Uninstall','Check')][string]$Mode = 'Install',
    [string]$ConfigPath = (Join-Path $env:APPDATA 'VRCX'),
    [string]$InstallPath = (Join-Path $env:ProgramFiles 'VRCX'),
    [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$begin = "`r`n;/* VRCX-COMMUNITY-HOST-BEGIN v1 */`r`n"
$end = "`r`n/* VRCX-COMMUNITY-HOST-END v1 */`r`n"
$restoreBegin = "`r`n;/* VRCX-COMMUNITY-RESTORE-BEGIN v1 */`r`n"
$restoreEnd = "`r`n/* VRCX-COMMUNITY-RESTORE-END v1 */`r`n"
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)
function Assert-NoLink([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Verknuepfungen werden nicht beschrieben: $cursor" }
        }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }; $cursor = $parent.FullName
    }
}
function Remove-ManagedBlock([string]$Text, [string]$Start, [string]$Finish) {
    $a = $Text.IndexOf($Start, [StringComparison]::Ordinal)
    $b = $Text.IndexOf($Finish, [StringComparison]::Ordinal)
    if ($a -lt 0 -and $b -lt 0) { return $Text }
    if ($a -lt 0 -or $b -lt $a -or $Text.IndexOf($Start, $a + $Start.Length, [StringComparison]::Ordinal) -ge 0 -or $Text.IndexOf($Finish, $b + $Finish.Length, [StringComparison]::Ordinal) -ge 0) {
        throw 'Unvollstaendiger oder mehrfacher Manager-Block. custom.js bleibt unveraendert.'
    }
    return $Text.Remove($a, $b + $Finish.Length - $a)
}
try {
    $configRoot = [IO.Path]::GetFullPath($ConfigPath)
    $applicationRoot = [IO.Path]::GetFullPath($InstallPath)
    $scriptPath = Join-Path $configRoot 'custom.js'
    Assert-NoLink $scriptPath
    $versionPath = Join-Path $applicationRoot 'Version'
    $version = if (Test-Path -LiteralPath $versionPath) { [IO.File]::ReadAllText($versionPath).Trim() } else { '' }
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
    $bundlePath = Join-Path $PSScriptRoot 'community-host.js'
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($bundlePath))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($hash -ne $manifest.sha256) { throw 'Paket-Pruefsumme stimmt nicht. Bitte vollstaendig neu entpacken.' }
    $old = ''; $bom = $false
    if (Test-Path -LiteralPath $scriptPath) {
        $bytes = [IO.File]::ReadAllBytes($scriptPath)
        $bom = $bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191
        $offset = if ($bom) { 3 } else { 0 }
        $old = $utf8.GetString($bytes, $offset, $bytes.Length - $offset)
    }
    # Validate markers before any write; content outside these markers is preserved.
    $clean = Remove-ManagedBlock $old $begin $end
    $clean = Remove-ManagedBlock $clean $restoreBegin $restoreEnd
    if ($clean.Contains('VRCX-COMMUNITY-HOST-BEGIN') -or $clean.Contains('VRCX-COMMUNITY-HOST-END') -or $clean.Contains('VRCX-COMMUNITY-RESTORE-BEGIN') -or $clean.Contains('VRCX-COMMUNITY-RESTORE-END')) {
        throw 'Beschaedigte Manager-Markierungen. Bitte zuerst custom.js pruefen; nichts wurde geschrieben.'
    }
    $installed = $old.Contains($begin)
    Write-Host "VRCX-Version: $version"
    Write-Host "Benutzerordner: $configRoot"
    Write-Host "Community-Manager vorhanden: $installed"
    if ($Mode -eq 'Check') {
        Write-Host "Freigegeben: $($manifest.vrcxVersions -join ', ')"
        if ($version -notin $manifest.vrcxVersions) { throw 'Diese VRCX-Version ist noch nicht freigegeben.' }
        Write-Host 'Paket und Dateistruktur sind in Ordnung.'
    } else {
        if (Get-Process -Name 'VRCX' -ErrorAction SilentlyContinue) { throw 'Bitte VRCX vollstaendig beenden (auch im Infobereich), dann erneut starten.' }
        if ($Mode -eq 'Install' -and $version -notin $manifest.vrcxVersions) { throw 'Nicht freigegebene VRCX-Version. Keine Dateien geaendert.' }
        if ($Mode -eq 'Install' -and (Test-Path -LiteralPath (Join-Path $applicationRoot '.vrcx-watchlist-backup/package-id.txt'))) {
            throw 'Alter HTML-Patch erkannt. Diesen zuerst mit seinem passenden Paket entfernen. Nach einem VRCX-Update niemals alte HTML-Backups zurueckkopieren; bei Bedarf offizielle VRCX-Installation reparieren.'
        }
        if ($Mode -eq 'Uninstall' -and -not $installed) { Write-Host 'Kein Manager installiert. Nichts geaendert.' }
        else {
            if ($Mode -eq 'Install') { $next = $clean + $begin + [IO.File]::ReadAllText($bundlePath) + $end }
            else {
                # This idempotent recovery runs once after removal, then is inert.
                # No direct SQLite editing while VRCX owns the database.
                $restore = @'
void (async () => {
    const repository = window.configRepository;
    if (!repository || !window.$pinia?.vrcxUpdater) return;
    const raw = await repository.getString('VRCX_CommunityHost_v1', null);
    if (!raw) return;
    const settings = JSON.parse(raw);
    if (settings.holdUpdates === false) return;
    const mode = ['Off', 'Auto Download', 'Notify'].includes(settings.previousUpdateMode) ? settings.previousUpdateMode : 'Off';
    await window.$pinia.vrcxUpdater.setAutoUpdateVRCX(mode);
    settings.holdUpdates = false;
    await repository.setString('VRCX_CommunityHost_v1', JSON.stringify(settings));
})().catch(error => console.error('Community-Manager: Update-Einstellung konnte nicht wiederhergestellt werden', error));
'@
                $next = $clean + $restoreBegin + $restore + $restoreEnd
            }
            [IO.Directory]::CreateDirectory($configRoot) | Out-Null
            $backupRoot = Join-Path $configRoot 'community-plugin-backups'
            Assert-NoLink $backupRoot
            [IO.Directory]::CreateDirectory($backupRoot) | Out-Null
            $stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N')
            $tempPath = Join-Path $configRoot ('.community-' + $stamp + '.tmp')
            $backupPath = Join-Path $backupRoot ('custom-' + $stamp + '.js')
            Assert-NoLink $tempPath
            $encoding = New-Object System.Text.UTF8Encoding($bom)
            [IO.File]::WriteAllText($tempPath, $next, $encoding)
            if (Test-Path -LiteralPath $scriptPath) { [IO.File]::Replace($tempPath, $scriptPath, $backupPath) }
            else { [IO.File]::Move($tempPath, $scriptPath) }
            Write-Host "Fertig: $Mode. VRCX kann wieder gestartet werden."
            Write-Host "Sicherungen: $backupRoot"
            if ($Mode -eq 'Uninstall') { Write-Host 'Listen bleiben gespeichert. Ein kleiner Wiederherstellungsblock setzt beim naechsten Start die vorherige Update-Einstellung zurueck.' }
        }
    }
    $result = 0
} catch { Write-Host "FEHLER: $($_.Exception.Message)" -ForegroundColor Red; $result = 1 }
if (-not $NoPause) { Read-Host 'Enter zum Schliessen' | Out-Null }
exit $result
