export const HOST_VERSION = '1.3.0';
export const API_VERSION = 1;
export const SUPPORTED_VRCX = ['2026.09.16'];
export const isUserId = id => typeof id === 'string' && /^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const copy = value => JSON.parse(JSON.stringify(value));
export const PERMISSIONS = ['events', 'users', 'blocks', 'storage', 'notifications', 'ui', 'network', 'lan', 'updates', 'gamelog'];
export function validatePackage(pkg) {
    const m = pkg?.manifest;
    if (!m || !/^[a-z][a-z0-9-]{2,63}$/.test(m.id) || !/^\d+\.\d+\.\d+$/.test(m.version) || m.apiVersion !== API_VERSION ||
        typeof m.name !== 'string' || !m.name.trim() || m.name.length > 100 ||
        !Array.isArray(m.permissions) || m.permissions.some(p => !PERMISSIONS.includes(p)) ||
        (m.hostApiOnly !== true && (!Array.isArray(m.vrcxVersions) || !m.vrcxVersions.length)) ||
        (m.vrcxVersions !== undefined && (!Array.isArray(m.vrcxVersions) || m.vrcxVersions.some(v => !/^\d{4}\.\d{2}\.\d{2}$/.test(v))) ||
        typeof pkg.code !== 'string' || pkg.code.length > 500000) throw Error('Ungültiges Plugin-Paket oder nicht unterstützte API.');
    return copy(pkg);
}
export function formatTemplate(template, person, category) {
    return template.replace(/\{(name|userId|category)\}/g, (_, k) => ({ name: person.displayName || person.userId, userId: person.userId, category })[k]);
}
export function normalizePeople(input = {}) {
    const ids = value => [...new Set((Array.isArray(value) ? value : []).filter(isUserId))].slice(0, 10000);
    const templates = {};
    for (const key of ['general', 'blocked_me', 'blocked_by_me', 'shared']) {
        const t = input.messageTemplates?.[key];
        if (typeof t === 'string' && t.trim() && t.length <= 300) templates[key] = t;
    }
    return { version: 3, userIds: ids(input.userIds), blockedMeUserIds: ids(input.blockedMeUserIds),
        notifyBlockedUsers: input.notifyBlockedUsers !== false, messageTemplates: templates,
        sources: (Array.isArray(input.sources) ? input.sources : []).slice(0, 30).map(validateList) };
}
export function validateList(value) {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 ||
        !Array.isArray(value.userIds) || value.userIds.length > 10000 || value.userIds.some(id => !isUserId(id))) throw Error('Liste benötigt name und höchstens 10000 gültige userIds.');
    let url = '';
    if (value.url) { const u = new URL(value.url); if (u.protocol !== 'https:' || u.username || u.password) throw Error('Listen-Abos benötigen HTTPS ohne Zugangsdaten in der URL.'); url = u.href; }
    return { name: value.name.trim(), userIds: [...new Set(value.userIds)], url,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt.slice(0, 40) : '', enabled: value.enabled !== false };
}
// Native live-log bridge only: the database history path never calls this tracker.
export class Presence {
    constructor(emit, now = () => Date.now()) { this.emit = emit; this.now = now; this.reset(); }
    reset() { this.location = ''; this.players = new Map(); this.epoch = (this.epoch || 0) + 1; }
    accept(raw, accountId, running) {
        if (!running || !isUserId(accountId) || !Array.isArray(raw)) return;
        const age = this.now() - Date.parse(raw[1]);
        if (!Number.isFinite(age) || age < -5000 || age > 60000) return;
        const type = raw[2];
        if (type === 'vrc-quit') { this.reset(); this.emit('instance.left', {}); return; }
        if (type === 'location-destination') { this.reset(); this.emit('instance.travel', {}); return; }
        if (type === 'location') {
            if (typeof raw[3] !== 'string' || !/^wrld_[^:]+:.+/.test(raw[3])) { this.reset(); return; }
            if (this.location === raw[3]) return;
            this.reset(); this.location = raw[3]; this.enteredAt = this.now();
            this.emit('instance.entered', { location: this.location, worldName: String(raw[4] || ''), epoch: this.epoch, complete: false }); return;
        }
        if (!this.location || !isUserId(raw[4]) || raw[4] === accountId) return;
        const person = { userId: raw[4], displayName: String(raw[3] || ''), location: this.location, epoch: this.epoch,
            duringEntry: this.now() - this.enteredAt < 15000, historical: false };
        if (type === 'player-joined' && !this.players.has(person.userId)) {
            this.players.set(person.userId, person); this.emit('player.joined', copy(person));
        } else if (type === 'player-left' && this.players.delete(person.userId)) this.emit('player.left', person);
    }
    snapshot() { return { location: this.location, players: [...this.players.values()].map(copy), complete: false, epoch: this.epoch }; }
}
export function serializedRepository(repository) {
    let queue = Promise.resolve();
    return { get: (key, fallback = null) => queue.then(async () => { const raw = await repository.getString(key, null); return raw === null ? copy(fallback) : JSON.parse(raw); }),
        set: (key, value) => { const raw = JSON.stringify(value); if (raw.length > 2000000) return Promise.reject(Error('Speicherlimit überschritten.'));
            const result = queue.then(() => repository.setString(key, raw)); queue = result.catch(() => {}); return result; } };
}
