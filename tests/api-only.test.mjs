import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePackage } from '../src/core.js';

test('API-only plugins can omit VRCX release pins and request LAN access', () => {
    const pkg = {
        manifest: {
            id: 'hydro-pi-sync',
            name: 'Hydro VRCX Pi Sync',
            version: '0.1.0',
            apiVersion: 1,
            hostApiOnly: true,
            permissions: ['users', 'storage', 'ui', 'lan']
        },
        code: ''
    };
    assert.deepEqual(validatePackage(pkg), pkg);
});

test('legacy plugins still require explicit VRCX releases', () => {
    const pkg = {
        manifest: {
            id: 'legacy-plugin',
            name: 'Legacy',
            version: '1.0.0',
            apiVersion: 1,
            permissions: ['ui']
        },
        code: ''
    };
    assert.throws(() => validatePackage(pkg));
});
