import test from 'node:test';
import assert from 'node:assert/strict';
import { Presence, normalizePeople, formatTemplate, validatePackage, validateList, serializedRepository } from '../src/core.js';
import { createUpdateGate, createAdapter } from '../src/adapter.js';
import { peoplePlugin } from '../src/people.js';
const me = 'usr_11111111-1111-1111-1111-111111111111', other = 'usr_22222222-2222-2222-2222-222222222222';
const where = 'wrld_33333333-3333-3333-3333-333333333333:123';
test('own entry, later joins, leave/rejoin, stale events, travel and real IDs', () => {
    let now = Date.now(), events = []; const p = new Presence((name, value) => events.push([name, value]), () => now);
    const send = (type, ...args) => p.accept([0, new Date(now).toISOString(), type, ...args], me, true);
    send('player-joined', 'Before location', other); assert.equal(events.length, 0);
    send('location', where); send('player-joined', 'Alice', other); send('player-joined', 'Alice', other);
    send('player-joined', 'Self', me); send('player-joined', 'No ID', ''); assert.equal(events.length, 2);
    assert.equal(events[1][1].duringEntry, true); assert.equal(p.snapshot().complete, false);
    now += 20000; send('player-left', 'Alice', other); send('player-joined', 'Alice', other);
    assert.equal(events.at(-1)[1].duringEntry, false);
    p.accept([0, new Date(now - 61000).toISOString(), 'location', where + 'x'], me, true); assert.equal(p.location, where);
    send('location-destination', where + 'x'); send('player-joined', 'Alice', other); assert.equal(p.players.size, 0);
    send('location', where + 'x'); send('player-joined', 'Alice', other); assert.equal(p.players.size, 1);
    send('vrc-quit'); assert.equal(p.location, '');
});
test('migration keeps categories/templates, validates feeds, literal substitution', () => {
    const n = normalizePeople({ userIds: [other, other, 'bad'], blockedMeUserIds: [me], notifyBlockedUsers: false, messageTemplates: { general: '{name} {category}' } });
    assert.deepEqual(n.userIds, [other]); assert.deepEqual(n.blockedMeUserIds, [me]); assert.equal(n.notifyBlockedUsers, false);
    assert.equal(formatTemplate('{name}: {userId}', { userId: other, displayName: '{userId}<b>' }, 'Test'), '{userId}<b>: ' + other);
    assert.throws(() => validateList({ name: 'Feed', userIds: [other], url: 'http://a.test/x' }));
    assert.throws(() => validateList({ name: 'Feed', userIds: ['not-id'] }));
});
test('serialized storage recovers after failure and reads only completed writes', async () => {
    const data = new Map(); let fail = true;
    const r = serializedRepository({ getString: async (k, d) => data.get(k) ?? d, setString: async (k, v) => { if (fail) { fail = false; throw Error('disk'); } data.set(k, v); } });
    await assert.rejects(r.set('x', 1)); await r.set('x', 2); assert.equal(await r.get('x'), 2);
});
test('plugin manifest rejects unknown permissions and unsupported API', () => {
    const p = { manifest: { id: 'sample-plugin', name: 'Sample', version: '1.0.0', apiVersion: 1, permissions: ['events'], vrcxVersions: ['2026.09.16'] }, code: '' };
    assert.deepEqual(validatePackage(p), p); assert.throws(() => validatePackage({ ...p, manifest: { ...p.manifest, apiVersion: 2 } }));
    assert.throws(() => validatePackage({ ...p, manifest: { ...p.manifest, permissions: ['native'] } }));
});
test('native update guard blocks internal download/restart, release restores previous mode', async () => {
    let calls = [], mode; const w = { AppApi: { DownloadUpdate: (...a) => calls.push(a), RestartApplication: x => calls.push(x) },
        $pinia: { vrcxUpdater: { setAutoUpdateVRCX: async v => { mode = v; } } }, configRepository: { getString: async () => 'Auto Download' } };
    const native = w.AppApi.DownloadUpdate, settings = {};
    const gate = await createUpdateGate(w, settings, async () => {}, () => {});
    assert.equal(mode, 'Off'); assert.throws(() => w.AppApi.DownloadUpdate('test')); assert.throws(() => w.AppApi.RestartApplication(true));
    w.AppApi.RestartApplication(false); assert.deepEqual(calls, [false]);
    await gate.set(false); assert.equal(mode, 'Auto Download'); w.AppApi.DownloadUpdate('test'); assert.equal(calls.length, 2);
    gate.dispose(); assert.equal(w.AppApi.DownloadUpdate, native);
});
test('failed update preference write keeps the guard held and restores stored state', async () => {
    let mode = 'Off', fail = false, persisted;
    const settings = { holdUpdates: true, previousUpdateMode: 'Notify' };
    const w = { AppApi: { DownloadUpdate() {}, RestartApplication() {} }, configRepository: {},
        $pinia: { vrcxUpdater: { setAutoUpdateVRCX: async value => { mode = value; } } } };
    const gate = await createUpdateGate(w, settings, async () => { if (fail) { fail = false; throw Error('disk full'); } persisted = { ...settings }; }, () => {});
    fail = true; await assert.rejects(gate.set(false), /disk full/);
    assert.equal(gate.held, true); assert.equal(mode, 'Off'); assert.equal(persisted.holdUpdates, true);
    assert.throws(() => w.AppApi.DownloadUpdate()); gate.dispose();
});
test('adapter preserves native handler, resets on account switch, filters own blocks', () => {
    let tick, nativeCalls = 0, events = [];
    const original = () => { nativeCalls++; return 7; };
    const w = { $pinia: { gameLog: { addGameLogEvent: original }, game: { isGameRunning: true }, user: { currentUser: { id: me } }, notification: { playNoty() {} },
        moderation: { cachedPlayerModerations: new Map([['a', { type: 'block', sourceUserId: me, targetUserId: other }], ['b', { type: 'block', sourceUserId: other, targetUserId: me }]]) } },
        configRepository: { setString() {} }, setInterval: f => { tick = f; return 1; }, clearInterval() {} };
    const a = createAdapter(w, (...v) => events.push(v), () => {});
    assert.equal(w.$pinia.gameLog.addGameLogEvent(JSON.stringify([0, new Date().toISOString(), 'location', where])), 7);
    assert.equal(nativeCalls, 1); assert.equal(a.blocks().length, 1);
    w.$pinia.user.currentUser.id = other; tick(); assert.equal(a.snapshot().location, ''); assert.equal(events.at(-1)[0], 'account.changed');
    a.dispose(); assert.equal(w.$pinia.gameLog.addGameLogEvent, original);
});
test('people alerts combine manual categories and own blocks; shared refresh replaces deletions', async () => {
    let page, joined, saved, output = [];
    const api = { storage: { get: async () => ({ userIds: [other], blockedMeUserIds: [other], sources: [{ name: 'Friends', userIds: [other], url: 'https://example.test/list' }] }), set: async (_, v) => { saved = v; } },
        events: { on: (_, fn) => { joined = fn; } }, users: { blocks: () => [{ userId: other }] }, notifications: { send: x => output.push(x) },
        ui: { page: p => { page = p; }, userAction() {}, refresh() {}, confirm: () => true }, network: { json: async () => ({ name: 'Friends', userIds: [] }) } };
    await peoplePlugin(api); joined({ userId: other, displayName: 'Alice' });
    assert.equal(output.length, 1); assert.match(output[0], /manueller Eintrag/); assert.match(output[0], /von dir blockiert/); assert.match(output[0], /Friends/);
    await page.onAction('refresh-source:0', {}); assert.deepEqual(saved.sources[0].userIds, []);
    await page.onAction('save', { notifyBlockedUsers: false, general: '{name}!', blocked_me: 'M {name}', blocked_by_me: 'B {name}', shared: 'S {name}' });
    joined({ userId: other, displayName: 'Alice' }); assert.equal(output.at(-1), 'Alice! | M Alice');
});
