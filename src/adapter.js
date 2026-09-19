import { Presence, isUserId } from './core.js';
export function gameLogPeople(store) {
    const entries = store.sessionsViewMode === 'sessions'
        ? (store.sessionsSegments || []).flatMap(s => (s.events || []).flatMap(e => e.members || [e]))
        : (store.gameLogTableData || []);
    const people = new Map();
    for (const e of entries) {
        if (!isUserId(e.userId)) continue;
        const person = { userId: e.userId, displayName: String(e.displayName || e.userId),
            createdAt: String(e.created_at || e.dt || ''), historical: true, source: 'game-log' };
        const previous = people.get(person.userId);
        if (!previous || person.createdAt > previous.createdAt) people.set(person.userId, person);
    }
    return [...people.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10000);
}
export function createAdapter(w, emit, log) {
    const s = w.$pinia;
    if (!s?.gameLog || typeof s.gameLog.addGameLogEvent !== 'function' || !s.user || !s.game ||
        typeof s.notification?.playNoty !== 'function' || typeof w.configRepository?.setString !== 'function') throw Error('VRCX-Schnittstelle fehlt. Erweiterungen bleiben ausgeschaltet.');
    const presence = new Presence(emit);
    const original = s.gameLog.addGameLogEvent;
    let account = s.user.currentUser?.id || '';
    function live(raw) {
        const result = original.apply(this, arguments);
        try { syncAccount(); presence.accept(JSON.parse(raw), account, s.game.isGameRunning); }
        catch (error) { log('Log-Ereignis verworfen: ' + error.message); }
        return result;
    }
    s.gameLog.addGameLogEvent = live;
    function syncAccount() {
        const id = s.user.currentUser?.id || '';
        if (id !== account) { account = id; presence.reset(); emit('account.changed', { userId: isUserId(id) ? id : '' }); }
        if (!s.game.isGameRunning && presence.location) { presence.reset(); emit('instance.left', {}); }
    }
    const timer = w.setInterval(syncAccount, 1000);
    return {
        account: () => isUserId(s.user.currentUser?.id) ? s.user.currentUser.id : '',
        selected: () => { const d = s.user.userDialog; return d?.visible && isUserId(d.id) ? { userId: d.id, displayName: d.ref?.displayName || d.id } : null; },
        blocks: () => [...(s.moderation?.cachedPlayerModerations?.values() || [])]
            .filter(m => m.type === 'block' && !m.$isExpired && m.sourceUserId === s.user.currentUser?.id && isUserId(m.targetUserId))
            .map(m => ({ userId: m.targetUserId, displayName: m.targetDisplayName || m.targetUserId })),
        snapshot: () => presence.snapshot(),
        gameLogPeople: () => gameLogPeople(s.gameLog),
        notify: message => s.notification.playNoty({ type: 'External', message, created_at: new Date().toISOString() }),
        dispose: () => { w.clearInterval(timer); if (s.gameLog.addGameLogEvent === live) s.gameLog.addGameLogEvent = original; }
    };
}

// Version-specific UI mounts. Never read names from DOM to guess a user's ID.
export function mountVrcxNavigation(w, { open, actions, report, logPeople, fallback }) {
    const owned = new Set(); let toolsMount, logMount, signature = '', disposed = false;
    function element(tag, text, parent) { const e = w.document.createElement(tag); if (text !== undefined) e.textContent = text; parent?.append(e); return e; }
    function mount(parent, id) {
        const outer = element('div'); outer.id = id; outer.style.cssText = 'flex-shrink:0;position:relative;z-index:2;margin:8px 0'; parent.prepend(outer); owned.add(outer);
        const root = outer.attachShadow({ mode: 'open' });
        element('style', ':host{font:14px system-ui;color:inherit}button,select{font:inherit;color:inherit;background:transparent;border:1px solid #718096;border-radius:6px;padding:7px;margin:3px}button{cursor:pointer}select{max-width:min(480px,90%)}option{color:#111;background:#fff}.status{font-size:12px}section{border:1px solid #718096;border-radius:8px;padding:8px}p{margin:4px}', root);
        return { outer, root };
    }
    function refresh() {
        if (disposed) return;
        const route = w.location.hash.split('?')[0];
        fallback.hidden = route !== '' && route !== '#/' && route !== '#/login';
        if (route === '#/tools') {
            const parent = w.document.querySelector('#chart .options-container');
            if (parent && (!toolsMount?.outer.isConnected || toolsMount.outer.parentElement !== parent)) {
                toolsMount?.outer.remove(); toolsMount = mount(parent, 'community-tools-entry');
                const b = element('button', 'Plugin-Manager · Community-Plugins', toolsMount.root); b.onclick = () => open();
                element('p', 'Personenlisten, Meldungen und Erweiterungen verwalten', toolsMount.root);
            }
            if (!parent) fallback.hidden = false;
        }
        if (route !== '#/game-log') return;
        const parent = w.document.querySelector('.x-container.x-container--auto-height');
        if (!parent) { fallback.hidden = false; return; }
        if (!logMount?.outer.isConnected || logMount.outer.parentElement !== parent) {
            logMount?.outer.remove(); logMount = mount(parent, 'community-gamelog-actions'); signature = '';
        }
        const people = logPeople(), available = actions();
        const next = JSON.stringify([people, available.map(a => [a.id, a.label])]);
        if (signature === next) return;
        signature = next;
        const oldSelection = logMount.root.querySelector('select')?.value;
        for (const e of [...logMount.root.children]) if (e.tagName !== 'STYLE') e.remove();
        const section = element('section', undefined, logMount.root);
        element('p', 'Personenlisten · Person direkt aus den geladenen Game-Log-Einträgen auswählen', section);
        const select = element('select', undefined, section); select.setAttribute('aria-label', 'Person aus dem Game Log');
        const placeholder = element('option', people.length ? 'Person auswählen …' : 'Keine Einträge mit gültiger userId geladen', select); placeholder.value = '';
        for (const p of people) { const option = element('option', `${p.displayName} · ${p.userId}`, select); option.value = p.userId; }
        if (people.some(p => p.userId === oldSelection)) select.value = oldSelection;
        const status = element('p', '', section); status.className = 'status'; status.setAttribute('role', 'status');
        for (const action of available) {
            const b = element('button', action.label, section);
            b.onclick = async () => {
                const person = people.find(p => p.userId === select.value); if (!person) { status.textContent = 'Bitte zuerst eine Person auswählen.'; return; }
                b.disabled = true;
                try { await action.run({ ...person }); status.textContent = 'Gespeichert: ' + person.displayName; }
                catch (error) { status.textContent = error.message; report(error.message); }
                finally { b.disabled = false; }
            };
        }
        const manage = element('button', 'Listen und Meldungen öffnen', section); manage.onclick = () => open('people-alerts:people');
        if (!available.length) element('p', 'Personenlisten-Plugin in Tools → Plugin-Manager aktivieren.', section);
    }
    const interval = w.setInterval(refresh, 1000);
    w.addEventListener('hashchange', refresh); refresh();
    return { refresh, dispose() { disposed = true; w.clearInterval(interval); w.removeEventListener('hashchange', refresh); for (const e of owned) e.remove(); } };
}
// Guard native calls too: store-internal closures bypass replacement store methods.
export async function createUpdateGate(w, settings, save, log) {
    const updater = w.$pinia?.vrcxUpdater;
    const originals = [];
    let held = settings.holdUpdates !== false;
    function guard(object, key, predicate) {
        if (typeof object?.[key] !== 'function') throw Error('Update-Schutz fehlt: ' + key);
        const original = object[key];
        const wrapped = function (...args) {
            if (held && predicate(...args)) { log('Update angehalten. Erst im Plugin-Menü freigeben.'); throw Error('Community-Plugin-Manager: Update angehalten.'); }
            return original.apply(this, args);
        };
        object[key] = wrapped;
        if (object[key] !== wrapped) throw Error('Update-Schutz konnte nicht installiert werden.');
        originals.push(() => { if (object[key] === wrapped) object[key] = original; });
    }
    try {
        guard(w.AppApi, 'DownloadUpdate', () => true);
        guard(w.AppApi, 'RestartApplication', upgrade => Boolean(upgrade));
        if (settings.previousUpdateMode === undefined) {
            settings.previousUpdateMode = await w.configRepository.getString('VRCX_autoUpdateVRCX', 'Auto Download'); await save();
        }
        if (held) await updater.setAutoUpdateVRCX('Off');
    } catch (e) { originals.reverse().forEach(f => f()); throw e; }
    return {
        get held() { return held; },
        async set(value) {
            const old = held; held = value; settings.holdUpdates = value;
            try { await updater.setAutoUpdateVRCX(value ? 'Off' : settings.previousUpdateMode); await save(); }
            catch (e) {
                held = old; settings.holdUpdates = old;
                try { await updater.setAutoUpdateVRCX(old ? 'Off' : settings.previousUpdateMode); await save(); }
                catch (rollback) { log('Update-Einstellung bitte prüfen: ' + rollback.message); }
                throw e;
            }
        },
        dispose() { originals.reverse().forEach(f => f()); }
    };
}
