import { HOST_VERSION, API_VERSION, SUPPORTED_VRCX, PERMISSIONS, copy, validatePackage, serializedRepository } from './core.js';
import { createAdapter, createUpdateGate, mountVrcxNavigation } from './adapter.js';
import { peopleManifest, peoplePlugin } from './people.js';
export async function startHost(w = window) {
    if (w.VRCXCommunityHost) return;
    const repository = serializedRepository(w.configRepository);
    const key = 'VRCX_CommunityHost_v1';
    const settings = await repository.get(key, { holdUpdates: true, plugins: {}, origins: {} });
    settings.plugins ||= {}; settings.origins ||= {};
    const save = () => repository.set(key, settings);
    const logs = [], active = new Map(), pages = new Map(), userActions = new Map(), events = new Map();
    let adapter, gate, navigation, disposed = false, selectedPage = '', renderUI = () => {};
    const log = message => { logs.unshift(new Date().toLocaleTimeString() + ' · ' + String(message).slice(0, 500)); logs.length = Math.min(logs.length, 80); };
    const version = String(await w.AppApi.GetVersion()).trim().replace(/^VRCX /, '');
    const compatible = SUPPORTED_VRCX.includes(version);
    const updateStatus = () => ({ vrcxVersion: version, hostVersion: HOST_VERSION, held: Boolean(gate?.held),
        supportedVrcxVersions: [...SUPPORTED_VRCX], compatible, automaticInstallation: false });
    const emit = (name, value) => { for (const fn of [...(events.get(name) || [])]) fn(copy(value)); };
    try { gate = await createUpdateGate(w, settings, save, log); }
    catch (e) { log('Update-Schutz nicht verfügbar: ' + e.message); }
    if (compatible && gate) adapter = createAdapter(w, emit, log);
    function stop(id) {
        const state = active.get(id); if (!state) return;
        state.stopped = true; for (const clean of state.cleanup.reverse()) { try { clean(); } catch (e) { log(id + ': ' + e.message); } }
        active.delete(id); for (const [k, p] of pages) if (p.owner === id) pages.delete(k);
        for (const [k, a] of userActions) if (a.owner === id) userActions.delete(k);
    }
    async function run(manifest, activate) {
        if (!adapter || !gate?.held || !manifest.vrcxVersions.includes(version) || settings.plugins[manifest.id]?.enabled === false) return;
        const state = { cleanup: [], errors: 0, stopped: false }; active.set(manifest.id, state);
        const ensure = permission => { if (state.stopped || disposed) throw Error('Plugin ist beendet.'); if (!manifest.permissions.includes(permission)) throw Error('Fehlende Berechtigung: ' + permission); };
        function safe(fn) { return async (...args) => {
            if (state.stopped) return;
            try { return await fn(...args); } catch (e) { log(manifest.name + ': ' + e.message); if (++state.errors >= 3) { stop(manifest.id); log(manifest.name + ' nach drei Fehlern für diese Sitzung pausiert.'); renderUI(); } throw e; }
        }; }
        const storageKey = (name, scope) => {
            ensure('storage'); if (!/^[a-zA-Z0-9_-]{1,80}$/.test(name)) throw Error('Ungültiger Speicherschlüssel.');
            if (scope !== 'local' && scope !== 'account') throw Error('Speicherbereich muss local oder account sein.');
            const account = scope === 'account' ? adapter.account() : 'local'; if (!account) throw Error('Kein angemeldetes Konto.');
            return `CommunityPlugin_${manifest.id}_${account}_${name}`;
        };
        const api = Object.freeze({ version: API_VERSION, hostVersion: HOST_VERSION,
            gameLog: Object.freeze({ people() { ensure('gamelog'); return copy(adapter.gameLogPeople()); } }),
            updates: Object.freeze({ status() { ensure('updates'); return updateStatus(); } }),
            events: Object.freeze({ on(name, handler) {
                ensure('events'); if (!['player.joined', 'player.left', 'instance.entered', 'instance.left', 'instance.travel', 'account.changed'].includes(name) || typeof handler !== 'function') throw Error('Unbekanntes Ereignis.');
                if (!events.has(name)) events.set(name, new Set());
                const wrapped = value => { void safe(handler)(value).catch(() => {}); }; events.get(name).add(wrapped);
                const off = () => events.get(name)?.delete(wrapped); state.cleanup.push(off); return off;
            } }),
            users: Object.freeze({ current: () => { ensure('users'); return { userId: adapter.account() }; },
                selected: () => { ensure('users'); return copy(adapter.selected()); },
                presence: () => { ensure('users'); return adapter.snapshot(); },
                blocks: () => { ensure('blocks'); return copy(adapter.blocks()); } }),
            storage: Object.freeze({ get: (name, fallback = null, scope = 'local') => repository.get(storageKey(name, scope), fallback),
                set: (name, value, scope = 'local') => repository.set(storageKey(name, scope), value),
                async legacyPeople() { ensure('storage'); if (manifest.id !== 'people-alerts') throw Error('Nur Migration des eingebauten Plugins.');
                    return await repository.get('VRCX_PersonWatchlist_v2', null) || await repository.get('VRCX_PersonWatchlist_v1', null); } }),
            notifications: Object.freeze({ send(message) { ensure('notifications'); if (typeof message !== 'string' || !message.trim() || message.length > 1800) throw Error('Meldung benötigt 1 bis 1800 Zeichen.');
                const now = Date.now(); state.notices = (state.notices || []).filter(t => now - t < 10000);
                if (state.notices.length >= 25) { log(manifest.name + ': Meldungsrate begrenzt.'); return; }
                state.notices.push(now); adapter.notify(message); } }),
            ui: Object.freeze({ page(page) { ensure('ui'); if (!/^[a-z][a-z0-9-]{0,40}$/.test(page.id) || typeof page.render !== 'function' || typeof page.onAction !== 'function') throw Error('Ungültige Seite.');
                pages.set(manifest.id + ':' + page.id, { ...page, owner: manifest.id, onAction: safe(page.onAction) }); },
                userAction(action) { ensure('ui'); if (!action.id || typeof action.run !== 'function') throw Error('Ungültige Nutzer-Aktion.');
                    userActions.set(manifest.id + ':' + action.id, { ...action, owner: manifest.id, run: safe(action.run) }); },
                refresh() { ensure('ui'); renderUI(); }, download(name, data) { ensure('ui'); download(name, data); },
                confirm(message) { ensure('ui'); return w.confirm(String(message)); } }),
            network: Object.freeze({ async json(address) {
                ensure('network'); const url = new URL(address); if (url.protocol !== 'https:' || url.username || url.password) throw Error('Nur HTTPS ohne eingebettete Zugangsdaten.');
                const grant = manifest.id + ':' + url.origin;
                if (!settings.origins[grant]) {
                    if (!w.confirm(`${manifest.name} möchte eine JSON-Liste von ${url.origin} abrufen. Die Website sieht dabei deine IP-Adresse. Zugriff auf diese Herkunft erlauben?`)) throw Error('Netzwerkzugriff abgelehnt.');
                    settings.origins[grant] = true; await save();
                }
                const controller = new AbortController(); const timer = w.setTimeout(() => controller.abort(), 15000);
                state.cleanup.push(() => controller.abort());
                try { const response = await w.fetch(url.href, { credentials: 'omit', redirect: 'error', signal: controller.signal, referrerPolicy: 'no-referrer' });
                    if (!response.ok) throw Error('HTTP ' + response.status);
                    const reader = response.body.getReader(); let size = 0, text = ''; const decoder = new TextDecoder();
                    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
                        if (size > 2000000) { await reader.cancel(); throw Error('Liste größer als 2 MB.'); } text += decoder.decode(value, { stream: true }); }
                    text += decoder.decode(); ensure('network'); return JSON.parse(text);
                } finally { w.clearTimeout(timer); }
            } }),
            lifecycle: Object.freeze({ onDispose(fn) { if (typeof fn !== 'function') throw Error('Funktion erwartet.'); state.cleanup.push(fn); } }),
            log: message => log(manifest.name + ': ' + message)
        });
        try { const dispose = await activate(api); if (typeof dispose === 'function') state.cleanup.push(dispose); }
        catch (error) { log(manifest.name + ' konnte nicht starten: ' + error.message); stop(manifest.id); }
    }
    async function start(id) {
        stop(id);
        if (id === peopleManifest.id) await run(peopleManifest, peoplePlugin);
        else {
            const pkg = validatePackage(settings.plugins[id]?.package);
            // Explicitly trusted local code, NOT a security sandbox (documented in import UI).
            await run(pkg.manifest, new Function('api', '"use strict"; return (async () => {\n' + pkg.code + '\n})();'));
        }
    }
    function download(name, data) {
        const url = w.URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = w.document.createElement('a'); a.href = url; a.download = name; a.click(); w.setTimeout(() => w.URL.revokeObjectURL(url), 5000);
    }
    function el(tag, text, parent) { const e = w.document.createElement(tag); if (text !== undefined) e.textContent = text; if (parent) parent.append(e); return e; }
    const container = el('div'); container.id = 'vrcx-community-host'; w.document.body.append(container);
    const root = container.attachShadow({ mode: 'open' });
    el('style', ':host{font:14px system-ui;color:#eee}*{box-sizing:border-box}button,input,textarea{font:inherit}button{background:#365976;color:white;border:1px solid #789;border-radius:5px;padding:7px 10px;cursor:pointer;margin:3px}button:hover{background:#467b9c}input,textarea{background:#18232c;color:#fff;border:1px solid #738391;border-radius:4px;padding:7px;width:100%}input[type=checkbox]{width:auto}textarea{min-height:75px}label{display:block;margin:10px 0}p{line-height:1.5;color:#cad7e0}h2,h3{margin:10px 0}.launch{position:fixed;right:14px;bottom:14px;z-index:2147483646}.panel{position:fixed;inset:5vh 5vw;z-index:2147483647;background:#14212b;border:1px solid #6d879b;border-radius:12px;padding:20px;overflow:auto;box-shadow:0 12px 60px #0009}.row{border-top:1px solid #41515d;padding:8px 0;overflow-wrap:anywhere}.error{color:#ffbc98;white-space:pre-wrap}.status{background:#243b4b;padding:10px;border-radius:6px}.close{float:right}pre{white-space:pre-wrap;overflow-wrap:anywhere}', root);
    const launcher = el('button', 'Plugins · Personenlisten', root); launcher.className = 'launch';
    const panel = el('section', undefined, root); panel.className = 'panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'VRCX Community-Plugins');
    launcher.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) renderUI(); };
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { panel.hidden = true; launcher.focus(); } });
    let message = '';
    function button(parent, label, callback) {
        const b = el('button', label, parent); b.onclick = async () => { b.disabled = true; try { await callback(); message = ''; }
            catch (e) { message = e.message; log(e.message); } finally { b.disabled = false; renderUI(); } }; return b;
    }
    renderUI = () => {
        if (panel.hidden || disposed) return;
        panel.replaceChildren(); button(panel, 'Schließen', () => { panel.hidden = true; launcher.focus(); }).className = 'close';
        el('h2', 'Community-Plugins · ' + HOST_VERSION, panel);
        el('p', `VRCX ${version} · API ${API_VERSION} · ${adapter ? 'Adapter aktiv' : 'Plugins pausiert: Version oder Schnittstelle nicht freigegeben'} · ${gate?.held ? 'Updates angehalten' : 'Updates nicht gesperrt'}`, panel).className = 'status';
        if (message) el('p', message, panel).className = 'error';
        const tabs = el('nav', undefined, panel); button(tabs, 'Plugin-Verwaltung', () => { selectedPage = ''; });
        for (const [id, page] of pages) button(tabs, page.title, () => { selectedPage = id; });
        const selected = adapter?.selected();
        if (selected) { const box = el('div', undefined, panel); el('h3', 'Geöffnetes VRCX-Profil: ' + selected.displayName, box);
            for (const action of userActions.values()) button(box, action.label, () => action.run(copy(selected))); }
        if (pages.has(selectedPage)) {
            const page = pages.get(selectedPage); let model;
            try { model = page.render(); } catch (e) { el('p', e.message, panel); return; }
            el('h3', page.title, panel); el('p', model.description || '', panel);
            const inputs = new Map();
            for (const field of (model.fields || []).slice(0, 100)) {
                const label = el('label', field.label, panel), input = el(field.type === 'textarea' ? 'textarea' : 'input', undefined, label);
                if (field.type !== 'textarea') input.type = field.type === 'checkbox' ? 'checkbox' : 'text';
                if (field.type === 'checkbox') input.checked = Boolean(field.value); else input.value = String(field.value ?? '');
                input.maxLength = field.maxLength || 1000000; inputs.set(field.id, input);
            }
            const values = () => Object.fromEntries([...inputs].map(([id, input]) => [id, input.type === 'checkbox' ? input.checked : input.value]));
            el('p', model.hint || '', panel);
            for (const action of (model.actions || []).slice(0, 50)) button(panel, action.label, () => page.onAction(action.id, values()));
            for (const row of (model.rows || []).slice(0, 20000)) { const line = el('div', row.text, panel); line.className = 'row'; if (row.action) button(line, row.label || 'Ausführen', () => page.onAction(row.action, values())); }
            return;
        }
        el('p', 'Plugins laufen als vertrauenswürdiger JavaScript-Code in VRCX und können technisch auf dessen Sitzung zugreifen. Berechtigungen strukturieren die API; sie sind keine Sicherheits-Sandbox. Installiere nur Code, dessen Herkunft und Inhalt du vertraust.', panel);
        const installed = [peopleManifest, ...Object.values(settings.plugins).filter(p => p.package).map(p => p.package.manifest)];
        for (const manifest of installed) {
            const row = el('div', `${manifest.name} ${manifest.version} · ${active.has(manifest.id) ? 'aktiv' : 'inaktiv'} · ${manifest.permissions.join(', ')}`, panel); row.className = 'row';
            const enabled = settings.plugins[manifest.id]?.enabled !== false;
            button(row, enabled ? 'Deaktivieren' : 'Aktivieren', async () => { settings.plugins[manifest.id] ||= {}; settings.plugins[manifest.id].enabled = !enabled;
                await save(); if (enabled) stop(manifest.id); else await start(manifest.id); });
            if (manifest.id !== peopleManifest.id) button(row, 'Entfernen', async () => { stop(manifest.id); delete settings.plugins[manifest.id]; await save(); });
        }
        const label = el('label', 'Plugin installieren oder aktualisieren (.json)', panel), input = el('input', undefined, label); input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async () => {
            try { const file = input.files?.[0]; if (!file) return; if (file.size > 1000000) throw Error('Plugin-Paket zu groß.');
                const pkg = validatePackage(JSON.parse(await file.text())); if (pkg.manifest.id === peopleManifest.id) throw Error('Das eingebaute Plugin wird mit dem Manager aktualisiert.');
                if (!pkg.manifest.vrcxVersions.includes(version)) throw Error('Plugin unterstützt diese VRCX-Version nicht.');
                const m = pkg.manifest;
                if (!w.confirm(`${m.name} ${m.version}\nBerechtigungen: ${m.permissions.join(', ')}\n\nVertrauenswürdigen Code installieren? Der Code hat technisch Zugriff auf deine VRCX-Sitzung.`)) return;
                const previous = settings.plugins[m.id]; settings.plugins[m.id] = { enabled: true, package: pkg };
                try { await save(); } catch (e) { if (previous) settings.plugins[m.id] = previous; else delete settings.plugins[m.id]; throw e; }
                await start(m.id); message = 'Plugin gespeichert. Status siehe oben.';
            } catch (e) { message = e.message; } renderUI();
        };
        el('h3', 'Updates und Wiederherstellung', panel);
        el('p', 'Der Manager bleibt bei VRCX-Updates im Benutzerordner erhalten. Nur ausdrücklich freigegebene Versionen starten Plugins. Aktuell freigegeben: ' + SUPPORTED_VRCX.join(', ') + '. Eine neue Version benötigt zuerst einen geprüften Manager-Adapter. Externe Installationsprogramme werden nicht blockiert.', panel);
        button(panel, 'Offizielle VRCX-Version prüfen', async () => {
            const controller = new AbortController(), timer = w.setTimeout(() => controller.abort(), 15000);
            try {
                const response = await w.fetch('https://api.github.com/repos/vrcx-team/VRCX/releases/latest', { credentials: 'omit', redirect: 'error', signal: controller.signal, referrerPolicy: 'no-referrer' });
                if (!response.ok) throw Error('Versionsprüfung: HTTP ' + response.status);
                const release = await response.json(), latest = String(release.tag_name || '').replace(/^v/, '');
                if (!/^\d{4}\.\d{2}\.\d{2}$/.test(latest)) throw Error('Unbekanntes Release-Format.');
                log('Offizielle stabile Version: ' + latest + (SUPPORTED_VRCX.includes(latest) ? ' · Manager freigegeben.' : ' · Update bleibt gesperrt, bis ein passender Manager vorliegt.'));
            } finally { w.clearTimeout(timer); }
        });
        if (gate) button(panel, gate.held ? 'Updates freigeben und Plugins pausieren' : 'Update-Schutz einschalten', async () => {
            if (gate.held) {
                if (!w.confirm('Plugins für diese Sitzung pausieren und normale VRCX-Updates wieder erlauben? Vor einem Update deine Listen exportieren.')) return;
                for (const id of [...active.keys()]) stop(id); await gate.set(false);
            } else { await gate.set(true); await start(peopleManifest.id);
                for (const id of Object.keys(settings.plugins)) if (id !== peopleManifest.id && settings.plugins[id].package) await start(id); }
        });
        button(panel, 'Manager-Einstellungen exportieren', () => download('community-manager.json', { version: 1, settings }));
        const backupLabel = el('label', 'Manager-Sicherung wiederherstellen (.json)', panel), backupInput = el('input', undefined, backupLabel);
        backupInput.type = 'file'; backupInput.accept = '.json,application/json';
        backupInput.onchange = async () => {
            try {
                const file = backupInput.files?.[0]; if (!file) return; if (file.size > 2000000) throw Error('Manager-Sicherung zu groß.');
                const backup = JSON.parse(await file.text());
                if (backup.version !== 1 || !backup.settings?.plugins || typeof backup.settings.plugins !== 'object' || Array.isArray(backup.settings.plugins)) throw Error('Ungültige Manager-Sicherung.');
                const plugins = {};
                for (const [id, record] of Object.entries(backup.settings.plugins)) {
                    if (id === peopleManifest.id) plugins[id] = { enabled: record.enabled !== false };
                    else { const pkg = validatePackage(record.package); if (pkg.manifest.id !== id) throw Error('Plugin-ID in Sicherung stimmt nicht überein.'); plugins[id] = { enabled: record.enabled !== false, package: pkg }; }
                }
                const names = Object.values(plugins).filter(p => p.package).map(p => `${p.package.manifest.name}: ${p.package.manifest.permissions.join(', ')}`);
                if (!w.confirm('Installierte Plugin-Pakete durch die Sicherung ersetzen? Enthaltener Code kann auf deine VRCX-Sitzung zugreifen. Netzwerkfreigaben werden zurückgesetzt.\n' + names.join('\n'))) return;
                const previous = { plugins: settings.plugins, origins: settings.origins };
                settings.plugins = plugins; settings.origins = {};
                try { await save(); } catch (e) { settings.plugins = previous.plugins; settings.origins = previous.origins; throw e; }
                for (const id of [...active.keys()]) stop(id);
                await start(peopleManifest.id);
                for (const id of Object.keys(plugins)) if (id !== peopleManifest.id) await start(id);
                message = 'Manager-Sicherung übernommen. Personenlisten und Update-Schutz bleiben separat erhalten.';
            } catch (e) { message = e.message; } renderUI();
        };
        button(panel, 'Netzwerkfreigaben zurücksetzen', async () => { settings.origins = {}; await save(); });
        el('p', 'Manager-Export enthält Plugin-Code, aber keine Personenlisten. Personenlisten separat auf deren Seite sichern. Beim Deinstallieren bleiben Listen gespeichert. Für VRCX-Updates zuerst oben freigeben.', panel);
        el('h3', 'Diagnose (diese Sitzung)', panel); el('pre', logs.join('\n') || 'Keine Fehler.', panel);
    };
    const publicHost = { version: HOST_VERSION, apiVersion: API_VERSION, vrcxVersion: version,
        status: () => ({ compatible, updateHeld: Boolean(gate?.held), active: [...active.keys()], logs: [...logs] }),
        dispose() { disposed = true; navigation?.dispose(); for (const id of [...active.keys()]) stop(id); adapter?.dispose(); gate?.dispose(); container.remove(); delete w.VRCXCommunityHost; } };
    w.VRCXCommunityHost = publicHost;
    await start(peopleManifest.id);
    for (const id of Object.keys(settings.plugins)) if (id !== peopleManifest.id && settings.plugins[id].package) {
        try { await start(id); } catch (e) { log(id + ': ' + e.message); }
    }
    if (compatible) navigation = mountVrcxNavigation(w, {
        open(page = '') { selectedPage = page; panel.hidden = false; renderUI(); },
        actions: () => [...userActions.values()], report: log, logPeople: () => adapter?.gameLogPeople() || [], fallback: launcher
    });
    return publicHost;
}
