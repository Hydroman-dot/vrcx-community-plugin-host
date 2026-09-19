import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mountUserMenus, resolvePlayerRow } from '../src/adapter.js';
let require = createRequire(import.meta.url), JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch { require = createRequire(new URL('../../VRCX/package.json', import.meta.url)); ({ JSDOM } = require('jsdom')); }
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'https://vrcx.test/#/player-list' });
const w = dom.window;
for (const key of ['window', 'document', 'Element', 'SVGElement', 'HTMLElement', 'Node']) globalThis[key] = w[key];
process.env.NODE_ENV = 'production';
let vue; try { vue = require('vue'); } catch { vue = createRequire(new URL('../../VRCX/package.json', import.meta.url))('vue'); }
const { createApp, h, Fragment, nextTick } = vue;
const a = 'usr_11111111-1111-1111-1111-111111111111', b = 'usr_22222222-2222-2222-2222-222222222222';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const pointer = node => node.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
const context = node => node.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));

test('production Vue keyed rows resolve real IDs, tolerate duplicate names and reordering, reject stale selections', async () => {
    const records = [a, b].map(id => ({ id: id + ':Same name', original: { ref: { id, displayName: 'Same name' } } }));
    const table = { getRowModel: () => ({ rows: records }) };
    const TableRow = { setup: (_, { slots }) => () => h('tr', { 'data-slot': 'table-row' }, slots.default()) };
    const Layout = { props: ['table'], setup: props => () => h('table', [h('tbody', props.table.getRowModel().rows.map(row => h(Fragment, { key: row.id }, [h(TableRow, {}, { default: () => h('td', row.original.ref.displayName) })])))]) };
    const app = createApp({ render: () => h(Layout, { table }) }); const vm = app.mount('#root');
    const saved = []; let account = a;
    const action = { label: 'Warnliste umschalten', run: person => saved.push(person) };
    let actions = [action];
    const menus = mountUserMenus(w, { actions: () => actions, selected: () => null, account: () => account, report: assert.fail });
    try {
        let rows = [...w.document.querySelectorAll('tr')];
        assert.equal(rows[0].__vueParentComponent, undefined);
        assert.equal(resolvePlayerRow(w, rows[0]).userId, a);
        assert.equal(resolvePlayerRow(w, rows[1]).userId, b);
        records.reverse(); vm.$forceUpdate(); w.document.getElementById('root')._vnode.component.subTree.component.proxy.$forceUpdate(); await nextTick();
        rows = [...w.document.querySelectorAll('tr')];
        assert.equal(resolvePlayerRow(w, rows[0]).userId, b);
        context(rows[0].firstChild); w.document.querySelector('[data-community-player-menu] button').click(); await flush();
        assert.equal(saved[0].userId, b);
        account = b; w.document.querySelector('[data-community-player-menu] button').click(); await flush(); assert.equal(saved.length, 1);
        context(rows[1]); actions = []; w.document.querySelector('[data-community-player-menu] button').click(); await flush(); assert.equal(saved.length, 1);
        w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(w.document.querySelector('[data-community-player-menu]'), null);
        w.location.hash = '#/friends'; assert.equal(resolvePlayerRow(w, rows[0]), null);
    } finally { menus.dispose(); app.unmount(); }
});

test('profile actions target only its associated menu and reject changed profile or disabled actions', async () => {
    await flush();
    const Dropdown = { name: 'UserActionDropdown', render: () => h('div', [h('div', { 'aria-haspopup': 'menu', 'aria-controls': 'profile-menu' }, [h('button', '...')])]) };
    const app = createApp({ render: () => h(Dropdown) }); app.mount('#root');
    const menu = w.document.createElement('div'); menu.id = 'profile-menu'; menu.dataset.slot = 'dropdown-menu-content'; menu.dataset.state = 'open'; w.document.body.append(menu);
    const other = menu.cloneNode(); other.id = 'other-menu'; w.document.body.append(other);
    const saved = []; let person = { userId: a, displayName: '<img src=x>' };
    const action = { label: 'Hat mich blockiert (manuell) umschalten', run: p => saved.push(p) }; let actions = [action];
    const menus = mountUserMenus(w, { actions: () => actions, selected: () => person, account: () => a, report: assert.fail });
    try {
        const trigger = w.document.querySelector('#root button'); pointer(trigger); menu.append(w.document.createTextNode('')); await flush();
        assert.equal(menu.querySelectorAll('[data-community-user-actions]').length, 1); assert.equal(other.children.length, 0); assert.equal(menu.querySelector('img'), null);
        const button = menu.querySelector('button'); button.click(); await flush(); assert.equal(saved[0].userId, a);
        button.focus(); button.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); assert.ok(button.isConnected);
        person = { userId: b, displayName: 'Other' }; button.click(); await flush(); assert.equal(saved.length, 1);
        person = { userId: a, displayName: 'Original' }; actions = []; button.click(); await flush(); assert.equal(saved.length, 1);
        menus.dispose(); assert.equal(menu.querySelector('[data-community-user-actions]'), null);
    } finally { menus.dispose(); app.unmount(); menu.remove(); other.remove(); }
});
