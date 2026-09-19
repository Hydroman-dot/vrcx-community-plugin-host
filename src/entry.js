import { startHost } from './host.js';
void startHost().then(host => {
    if (host) console.info('Community-Plugins gestartet: ' + JSON.stringify(host.status()));
}).catch(error => {
    console.error('VRCX Community Host', error);
    const note = document.createElement('div'); note.textContent = 'Community-Plugins konnten nicht starten: ' + error.message;
    note.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#602d21;color:white;padding:16px;max-width:500px';
    document.body.append(note);
});
