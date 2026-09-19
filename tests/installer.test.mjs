import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const psquote = s => "'" + s.replaceAll("'", "''") + "'";
test('Windows installer: preserve custom code, upgrade, remove, refuse corrupt and unknown inputs', { skip: process.platform !== 'win32' }, () => {
    const base = mkdtempSync(path.join(root, 'installer-test-')), config = path.join(base, 'config'), app = path.join(base, 'app'), pkg = path.join(base, 'package');
    mkdirSync(config); mkdirSync(app); cpSync(path.join(root, 'dist'), pkg, { recursive: true });
    writeFileSync(path.join(app, 'Version'), '2026.09.16');
    const original = '\ufeff// Bestehendes Skript – bleibt erhalten\r\nwindow.myOwnSetting = 42;\r\n';
    const script = path.join(config, 'custom.js'); writeFileSync(script, original);
    const run = (mode, dir = config) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
        // Mock only process inventory. All file operations use real isolated fixture directories.
        `function Get-Process { param($Name,$ErrorAction) }; & ${psquote(path.join(pkg, 'Plugin-Manager.ps1'))} -Mode ${mode} -ConfigPath ${psquote(dir)} -InstallPath ${psquote(app)} -NoPause`], { encoding: 'utf8' });
    let result = run('Install'); assert.equal(result.status, 0, result.stdout + result.stderr);
    const installed = readFileSync(script, 'utf8'); assert.ok(installed.startsWith(original));
    result = run('Install'); assert.equal(result.status, 0, result.stdout + result.stderr); assert.equal(readFileSync(script, 'utf8'), installed);
    assert.ok(readdirSync(path.join(config, 'community-plugin-backups')).length >= 2);
    result = run('Uninstall'); assert.equal(result.status, 0, result.stdout + result.stderr);
    const removed = readFileSync(script, 'utf8'); assert.ok(removed.startsWith(original)); assert.ok(!removed.includes('HOST-BEGIN')); assert.ok(removed.includes('RESTORE-BEGIN'));
    result = run('Uninstall'); assert.equal(result.status, 0); assert.equal(readFileSync(script, 'utf8'), removed);
    writeFileSync(path.join(app, 'Version'), '2026.10.01'); result = run('Install'); assert.equal(result.status, 1); assert.equal(readFileSync(script, 'utf8'), removed);
    writeFileSync(path.join(app, 'Version'), '2026.09.16'); writeFileSync(script, '// VRCX-COMMUNITY-HOST-BEGIN'); result = run('Install'); assert.equal(result.status, 1); assert.equal(readFileSync(script, 'utf8'), '// VRCX-COMMUNITY-HOST-BEGIN');
    writeFileSync(script, original);
    const link = path.join(base, 'linked-config'); symlinkSync(config, link, 'junction'); result = run('Install', link); assert.equal(result.status, 1); assert.equal(readFileSync(script, 'utf8'), original);
    writeFileSync(path.join(pkg, 'community-host.js'), 'tampered'); result = run('Install'); assert.equal(result.status, 1); assert.equal(readFileSync(script, 'utf8'), original);
});
