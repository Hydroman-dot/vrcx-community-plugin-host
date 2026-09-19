import { normalizePeople, validateList, isUserId, formatTemplate } from './core.js';
export const peopleManifest = { id: 'people-alerts', name: 'Personenlisten', version: '1.1.0', apiVersion: 1,
    vrcxVersions: ['2026.09.16'], permissions: ['events', 'users', 'blocks', 'storage', 'notifications', 'ui', 'network'] };
export async function peoplePlugin(api) {
    let data = normalizePeople(await api.storage.get('lists', null) || await api.storage.legacyPeople() || {});
    const titles = { general: 'Warnliste', blocked_me: 'Hat mich blockiert (manuell)', blocked_by_me: 'Von mir blockiert', shared: 'Geteilte Liste' };
    const defaults = {
        general: '⚠ {name} aus deiner Warnliste ist in deiner Instanz.',
        blocked_me: '⚠ {name} ist in deiner Instanz: hat mich blockiert (manueller Eintrag).',
        blocked_by_me: '⚠ {name}, von dir blockiert, ist in deiner Instanz.',
        shared: '⚠ {name} aus {category} ist in deiner Instanz.'
    };
    let writes = Promise.resolve();
    const change = fn => {
        const job = writes.then(async () => { const next = normalizePeople(data); fn(next); await api.storage.set('lists', next); data = next; api.ui.refresh(); });
        writes = job.catch(() => {}); return job;
    };
    await api.storage.set('lists', data);
    function warn(person) {
        const reasons = [];
        if (data.userIds.includes(person.userId)) reasons.push(['general', titles.general]);
        if (data.blockedMeUserIds.includes(person.userId)) reasons.push(['blocked_me', titles.blocked_me]);
        if (data.notifyBlockedUsers && api.users.blocks().some(p => p.userId === person.userId)) reasons.push(['blocked_by_me', titles.blocked_by_me]);
        for (const source of data.sources) if (source.enabled && source.userIds.includes(person.userId)) reasons.push(['shared', source.name]);
        if (reasons.length) api.notifications.send(reasons.map(([key, category]) => formatTemplate(data.messageTemplates[key] || defaults[key], person, category)).join(' | ').slice(0, 1800));
    }
    api.events.on('player.joined', warn);
    // The adapter handles presence deduplication; this plugin never polls old log history.
    for (const [key, listKey] of [['general', 'userIds'], ['blocked_me', 'blockedMeUserIds']]) {
        api.ui.userAction({ id: key, label: titles[key] + ' umschalten', run: person => change(next => {
            const index = next[listKey].indexOf(person.userId);
            if (index < 0) next[listKey].push(person.userId); else next[listKey].splice(index, 1);
        }) });
    }
    api.ui.page({ id: 'people', title: 'Personenlisten', render: () => ({
        description: 'Markiere Personen hier per userId oder öffne ihr VRCX-Profil und nutze oben die Nutzer-Aktionen. „Hat mich blockiert“ ist ausschließlich deine manuelle Angabe. Warnungen erscheinen auch beim eigenen Beitritt, sobald VRChat die anwesenden Personen meldet.',
        fields: [ { id: 'userId', label: 'VRChat userId', type: 'text', value: '' },
            { id: 'notifyBlockedUsers', label: 'Bei meinen aktiven VRChat-Blocks warnen', type: 'checkbox', value: data.notifyBlockedUsers },
            ...Object.keys(titles).map(key => ({ id: key, label: titles[key] + ' – Meldung', type: 'text', value: data.messageTemplates[key] || defaults[key], maxLength: 300 })),
            { id: 'listJson', label: 'Geteilte Liste als JSON (name, userIds)', type: 'textarea', value: '' },
            { id: 'feedUrl', label: 'HTTPS-Adresse einer geteilten Liste (nur lesend)', type: 'text', value: '' } ],
        hint: 'Platzhalter: {name}, {userId}, {category}. VRCX-Einstellungen für Overlay, Desktop, TTS und „Beschäftigt“ gelten weiterhin. Abos werden beim Anklicken aktualisiert; keine automatische Veröffentlichung.',
        actions: [{ id: 'add-general', label: 'Zur Warnliste' }, { id: 'add-blocked', label: 'Zu „Hat mich blockiert“' },
            { id: 'save', label: 'Meldungen speichern' }, { id: 'reset', label: 'Standardmeldungen' }, { id: 'preview', label: 'Testmeldung senden' },
            { id: 'export', label: 'Meine Warnliste teilen' }, { id: 'backup', label: 'Alle Listen und Meldungen sichern' },
            { id: 'restore', label: 'Sicherung aus JSON wiederherstellen' }, { id: 'import', label: 'Geteilte Liste importieren' }, { id: 'subscribe', label: 'Listen-Abo hinzufügen' }],
        rows: [ ...data.userIds.map(id => ({ text: 'Warnliste · ' + id, action: 'remove-general:' + id, label: 'Entfernen' })),
            ...data.blockedMeUserIds.map(id => ({ text: 'Hat mich blockiert (manuell) · ' + id, action: 'remove-blocked:' + id, label: 'Entfernen' })),
            ...api.users.blocks().map(p => ({ text: 'Von mir blockiert (VRChat) · ' + p.displayName + ' · ' + p.userId })),
            ...data.sources.flatMap((s, i) => [ { text: `${s.name} · ${s.userIds.length} Personen · ${s.enabled ? 'aktiv' : 'pausiert'} · ${s.updatedAt || 'importiert'}${s.url ? ' · ' + s.url : ''}`, action: 'toggle-source:' + i, label: 'Aktiv/Pause' },
                ...(s.url ? [{ text: s.name, action: 'refresh-source:' + i, label: 'Abo aktualisieren' }] : []),
                { text: s.name, action: 'remove-source:' + i, label: 'Liste entfernen' } ]) ]
    }), async onAction(action, values) {
        const person = { userId: values.userId?.trim(), displayName: 'Beispielperson' };
        if (action.startsWith('add-')) {
            if (!isUserId(person.userId)) throw Error('Bitte eine gültige usr_…-ID eingeben.');
            await change(next => { const key = action === 'add-general' ? 'userIds' : 'blockedMeUserIds'; if (!next[key].includes(person.userId)) next[key].push(person.userId); });
        } else if (action.startsWith('remove-general:') || action.startsWith('remove-blocked:')) {
            const [kind, id] = action.split(':'); await change(next => { const key = kind === 'remove-general' ? 'userIds' : 'blockedMeUserIds'; next[key] = next[key].filter(x => x !== id); });
        } else if (action === 'save') {
            for (const key of Object.keys(titles)) if (!values[key]?.trim() || values[key].length > 300) throw Error('Meldungen benötigen 1 bis 300 Zeichen.');
            await change(next => { next.notifyBlockedUsers = values.notifyBlockedUsers; next.messageTemplates = Object.fromEntries(Object.keys(titles).map(k => [k, values[k]])); });
        } else if (action === 'reset') await change(next => { next.messageTemplates = {}; });
        else if (action === 'preview') api.notifications.send(formatTemplate(values.general || defaults.general, { ...person, userId: isUserId(person.userId) ? person.userId : 'usr_00000000-0000-0000-0000-000000000000' }, titles.general));
        else if (action === 'export') api.ui.download('meine-warnliste.json', { name: 'Geteilte Warnliste', userIds: data.userIds });
        else if (action === 'backup') api.ui.download('personenlisten-sicherung.json', { kind: 'vrcx-people-backup', data });
        else if (action === 'restore') {
            const backup = JSON.parse(values.listJson);
            if (backup.kind !== 'vrcx-people-backup' || backup.data?.version !== 3) throw Error('Keine gültige Personenlisten-Sicherung.');
            if (api.ui.confirm('Alle lokalen Personenlisten und Meldungstexte durch diese Sicherung ersetzen?')) await change(next => Object.assign(next, normalizePeople(backup.data)));
        }
        else if (action === 'import' || action === 'subscribe') {
            const list = action === 'import' ? validateList(JSON.parse(values.listJson)) : validateList({ ...await api.network.json(values.feedUrl), url: values.feedUrl, updatedAt: new Date().toISOString() });
            await change(next => { if (next.sources.length >= 30) throw Error('Höchstens 30 geteilte Listen.'); next.sources.push(list); });
        } else if (action.startsWith('refresh-source:')) {
            const index = Number(action.split(':')[1]), old = data.sources[index];
            const list = validateList({ ...await api.network.json(old.url), url: old.url, enabled: old.enabled, updatedAt: new Date().toISOString() });
            await change(next => { if (next.sources[index]?.url !== old.url) throw Error('Liste wurde zwischenzeitlich geändert.'); next.sources[index] = list; });
        } else if (action.startsWith('remove-source:')) await change(next => { next.sources.splice(Number(action.split(':')[1]), 1); });
        else if (action.startsWith('toggle-source:')) await change(next => { const s = next.sources[Number(action.split(':')[1])]; s.enabled = !s.enabled; });
    } });
}
