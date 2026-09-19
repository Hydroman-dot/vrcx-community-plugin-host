import { readFile, writeFile, mkdir, copyFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { HOST_VERSION, SUPPORTED_VRCX } from './src/core.js';
const names = ['core', 'adapter', 'people', 'host', 'entry'];
let source = `/* VRCX Community Host ${HOST_VERSION} | MIT | adapter v2026.09.16 */\n;(function(){\n"use strict";\n`;
for (const name of names) source += '\n' + (await readFile(new URL(`src/${name}.js`, import.meta.url), 'utf8'))
    .replace(/^import .*?;\r?\n/gm, '').replace(/^export /gm, '') + '\n';
source += '\n})();\n';
await mkdir(new URL('dist/', import.meta.url), { recursive: true });
await writeFile(new URL('dist/community-host.js', import.meta.url), source);
await writeFile(new URL('dist/manifest.json', import.meta.url), JSON.stringify({ id: 'vrcx-community-host', version: HOST_VERSION,
    vrcxVersions: SUPPORTED_VRCX, upstreamCommit: '1bf052f84c670b96bfe44156e097eb668ae78de7', sha256: createHash('sha256').update(source).digest('hex') }, null, 2));
for (const name of ['Plugin-Manager.ps1', 'Installieren.cmd', 'Entfernen.cmd', 'Pruefen.cmd', 'ANLEITUNG.md', 'API.md', 'SCHNITTSTELLE-DE.md', 'LICENSE']) {
    await copyFile(new URL(name, import.meta.url), new URL('dist/' + name, import.meta.url));
}
await cp(new URL('examples/', import.meta.url), new URL('dist/examples/', import.meta.url), { recursive: true });
console.log('Built dist/community-host.js');
