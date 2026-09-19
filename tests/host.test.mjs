import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startHost } from '../src/host.js';
import { gameLogPeople, mountVrcxNavigation } from '../src/adapter.js';
let require = createRequire(import.meta.url), JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch { ({ JSDOM } = createRequire(new URL('../../VRCX/package.json', import.meta.url))('jsdom')); }
const me = 'usr_11111111-1111-1111-1111-111111111111', person = 'usr_22222222-2222-2222-2222-222222222222';
async function setup(version = '2026.09.16', initial = {}) {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://vrcx.test/' }), w = dom.window;
    const db = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)])), sent = [];
    w.confirm = () => true;
    w.configRepository = { getString: async (k, fallback) => db.get(k) ?? fallback, setString: async (k, v) => { db.set(k, v); } };
    w.AppApi = { GetVersion: async () => 'VRCX ' + version, DownloadUpdate: () => {}, RestartApplication: () => {} };
    w.$pinia = { user: { currentUser: { id: me }, userDialog: { visible: true, id: person, ref: { displayName: '<img src=x onerror=alert(1)>' } } },
        gameLog: { addGameLogEvent() {} }, game: { isGameRunning: true }, moderation: { cachedPlayerModerations: new Map() },
        notification: { playNoty: noty => { sent.push(noty); } }, vrcxUpdater: { setAutoUpdateVRCX: async value => w.configRepository.setString('VRCX_autoUpdateVRCX', value) } };
    const host = await startHost(w), root = w.document.querySelector('#vrcx-community-host').shadowRoot;
    const flush = () => new Promise(resolve => setTimeout(resolve, 15));
    const click = async text => { const b = [...root.querySelectorAll('button')].find(e => e.textContent === text); assert.ok(b, text); b.click(); await flush(); };
    const raw = (type, ...args) => w.$pinia.gameLog.addGameLogEvent(JSON.stringify([0, new Date().toISOString(), type, ...args]));
    return { dom, w, host, root, db, sent, click, raw, flush, close: () => { host.dispose(); dom.window.close(); } };
}
test('real host UI marks selected profile, survives restart and sends built-in External notification', async () => {
    const x = await setup();
    try {
        await x.click('Plugins · Personenlisten'); assert.equal(x.root.querySelector('img'), null);
        await x.click('Warnliste umschalten');
        assert.deepEqual(JSON.parse(x.db.get('CommunityPlugin_people-alerts_local_lists')).userIds, [person]);
        x.raw('location', 'wrld_a:1'); x.raw('player-joined', 'Alice', person); await x.flush();
        assert.equal(x.sent.length, 1); assert.equal(x.sent[0].type, 'External'); assert.match(x.sent[0].message, /Alice/);
        x.raw('player-joined', 'Alice', person); await x.flush(); assert.equal(x.sent.length, 1);
        await x.click('Personenlisten'); assert.match(x.root.textContent, /Standardmeldungen/);
        await x.click('Plugin-Verwaltung'); await x.click('Updates freigeben und Plugins pausieren');
        assert.deepEqual(x.host.status().active, []); assert.equal(x.host.status().updateHeld, false);
        await x.click('Update-Schutz einschalten'); assert.deepEqual(x.host.status().active, ['people-alerts']);
        await x.click('Deaktivieren'); assert.deepEqual(x.host.status().active, []);
    } finally { x.close(); }
});
test('unknown VRCX is held but plugins never start or intercept live logs', async () => {
    const x = await setup('2026.10.01'); try { assert.equal(x.host.status().compatible, false); assert.deepEqual(x.host.status().active, []);
        assert.throws(() => x.w.AppApi.DownloadUpdate()); await x.click('Plugins · Personenlisten'); assert.match(x.root.textContent, /Plugins pausiert/);
    } finally { x.close(); }
});
test('legacy migration only happens once and update release persists across restart', async () => {
    const x = await setup('2026.09.16', { VRCX_PersonWatchlist_v2: { version: 2, userIds: [person], blockedMeUserIds: [me], messageTemplates: { general: 'ACHTUNG {name}' } } });
    try { const list = JSON.parse(x.db.get('CommunityPlugin_people-alerts_local_lists')); assert.deepEqual(list.blockedMeUserIds, [me]); assert.equal(list.messageTemplates.general, 'ACHTUNG {name}'); } finally { x.close(); }
    const y = await setup('2026.09.16', { VRCX_CommunityHost_v1: { holdUpdates: false, previousUpdateMode: 'Off', plugins: {}, origins: {} } });
    try { assert.deepEqual(y.host.status().active, []); assert.equal(y.host.status().updateHeld, false); } finally { y.close(); }
});
test('plugin errors stop only the faulty plugin, cleanup removes all subscriptions', async () => {
    const pkg = { manifest: { id: 'faulty-plugin', name: 'Faulty', apiVersion: 1, version: '1.0.0', vrcxVersions: ['2026.09.16'], permissions: ['events'] },
        code: "api.events.on('instance.entered', () => { throw Error('example failure'); });" };
    const x = await setup('2026.09.16', { VRCX_CommunityHost_v1: { holdUpdates: true, plugins: { 'faulty-plugin': { enabled: true, package: pkg } }, origins: {} } });
    try { for (let i = 0; i < 3; i++) { x.raw('location', 'wrld_a:' + i); await x.flush(); }
        assert.deepEqual(x.host.status().active, ['people-alerts']); assert.match(x.host.status().logs.join(), /drei Fehlern/);
    } finally { x.close(); }
});
test('missing declared permission prevents notification and leaves built-in plugin active', async () => {
    const pkg = { manifest: { id: 'no-permission', name: 'No permission', apiVersion: 1, version: '1.0.0', vrcxVersions: ['2026.09.16'], permissions: [] }, code: "api.notifications.send('Should not be sent');" };
    const x = await setup('2026.09.16', { VRCX_CommunityHost_v1: { holdUpdates: true, plugins: { 'no-permission': { enabled: true, package: pkg } }, origins: {} } });
    try { assert.deepEqual(x.sent, []); assert.deepEqual(x.host.status().active, ['people-alerts']); assert.match(x.host.status().logs.join(), /Berechtigung/); } finally { x.close(); }
});
test('manager recovery validates packages, resets network grants and retains update hold', async () => {
    const x = await setup();
    try {
        await x.click('Plugins · Personenlisten');
        const input = [...x.root.querySelectorAll('input[type=file]')].find(i => i.parentElement.textContent.includes('Manager-Sicherung'));
        const pkg = { manifest: { id: 'recovered-plugin', name: 'Recovered', apiVersion: 1, version: '1.0.0', vrcxVersions: ['2026.09.16'], permissions: ['updates'] }, code: "if(!api.updates.status().held) throw Error('guard missing');" };
        Object.defineProperty(input, 'files', { value: [{ size: 500, text: async () => JSON.stringify({ version: 1, settings: { holdUpdates: false, origins: { unsafe: true }, plugins: { 'recovered-plugin': { package: pkg, enabled: true } } } }) }] });
        await input.onchange();
        const saved = JSON.parse(x.db.get('VRCX_CommunityHost_v1'));
        assert.deepEqual(saved.origins, {}); assert.equal(saved.holdUpdates, true);
        assert.deepEqual(x.host.status().active, ['people-alerts', 'recovered-plugin']);
    } finally { x.close(); }
});
test('Tools entry opens manager; Game Log actions use exact IDs, support sessions and clean up', async () => {
    const dom = new JSDOM('<body><div id="chart"><div class="options-container"></div></div><div class="x-container x-container--auto-height"></div><button id="fallback"></button></body>', { url: 'https://vrcx.test/#/tools' });
    const w = dom.window, calls = [], people = [{ userId: person, displayName: '<Same name>' }, { userId: me, displayName: '<Same name>' }];
    const bridge = mountVrcxNavigation(w, { open: page => calls.push(page || 'manager'), actions: () => [{ id: 'mark', label: 'Markieren', run: p => calls.push(p) }], report() {}, logPeople: () => people, fallback: w.document.getElementById('fallback') });
    try {
        w.document.getElementById('community-tools-entry').shadowRoot.querySelector('button').click(); assert.equal(calls[0], 'manager');
        w.location.hash = '#/game-log'; bridge.refresh(); const root = w.document.getElementById('community-gamelog-actions').shadowRoot;
        const select = root.querySelector('select'); assert.equal(select.options.length, 3); assert.equal(root.querySelector('img'), null);
        select.value = person; root.querySelector('button').click(); await Promise.resolve(); assert.equal(calls[1].userId, person);
        bridge.refresh(); assert.equal(select.value, person); assert.equal(w.document.querySelectorAll('#community-gamelog-actions').length, 1);
        assert.deepEqual(gameLogPeople({ sessionsViewMode: 'sessions', sessionsSegments: [{ events: [{ type: 'JoinGroup', members: [{ userId: person, displayName: 'Alice' }, { userId: '', displayName: 'Missing' }] }] }] }).map(p => p.userId), [person]);
        const rows = gameLogPeople({ sessionsViewMode: 'table', gameLogTableData: [{ userId: person, displayName: 'Old', created_at: '2025' }, { userId: person, displayName: 'New', created_at: '2026' }] });
        assert.equal(rows.length, 1); assert.equal(rows[0].displayName, 'New'); assert.equal(rows[0].historical, true);
    } finally { bridge.dispose(); assert.equal(w.document.querySelector('#community-tools-entry'), null); dom.window.close(); }
});
