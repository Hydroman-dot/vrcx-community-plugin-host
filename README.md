# VRCX Community Plugin Host

An independent community plugin manager and versioned JavaScript API for **VRCX 2026.09.16 on Windows**. It loads through VRCX's existing `custom.js` entry point; it does not replace the application or its HTML bundle.

**Early community release.** Not an official VRCX extension API or a VRChat client modification. Only explicitly tested VRCX versions are enabled. Plugins are trusted JavaScript, **not sandboxed**. A real VRChat/SteamVR end-to-end notification test is still outstanding.

[Deutsche Anleitung](ANLEITUNG.md) · [Schnittstelle und Datenformate (Deutsch)](SCHNITTSTELLE-DE.md) · [Plugin API v1](API.md) · [Example plugin](examples/hello-plugin.json) · [Contributing](CONTRIBUTING.md)

## What is included

- Plugin installation, updates, enable/disable, removal and settings backup/restore.
- Manager entry under **Tools** and direct person-marking actions in **Game Log**, using loaded rows with exact user IDs.
- API v1: live instance/player events, selected user, outgoing blocks, namespaced storage, declarative settings pages, user actions, notifications, approved HTTPS JSON requests and update status.
- Built-in people alerts: general watchlist, manually entered “blocked me” list, and the current account's own active VRChat blocks.
- Alerts on other players joining and on your own instance entry as real user IDs appear in live logs; editable notification templates.
- Shared lists with visible sources, import/export, pause/remove and manual HTTPS subscription refresh.
- Update gating and exact VRCX compatibility checks. Unknown releases do not start plugins.

No incoming block information is detected, inferred or bypassed. Lists contain local choices or claims from their stated source. No lists or credentials are automatically published.

## Install

Use the [1.1.0 installation ZIP](downloads/VRCX-Plugin-Manager-1.1.0-fuer-2026.09.16.zip), extract it, close VRCX completely and run `Installieren.cmd`. Restart VRCX and open **Tools → Plugin-Manager · Community-Plugins**. The floating entry remains on the login screen as a fallback. `Entfernen.cmd` removes the manager while preserving stored lists. Read [the installation guide](ANLEITUNG.md) for existing HTML patches, custom data directories, backups and update behavior.

The installer modifies only the managed block in your VRCX data directory's `custom.js`, retaining existing code and making backups. It does not reinstall VRCX. Your normal VRCX notification preferences and busy status apply.

## Develop a plugin

1. Copy [examples/hello-plugin.json](examples/hello-plugin.json).
2. Choose your own manifest `id`, declare only the API permissions you need, and list tested VRCX versions.
3. Put your activation function body in `code`; it receives `api`.
4. Import the JSON file in the manager. Review the [full API contract](API.md), particularly lifecycle cleanup and incomplete presence snapshots.

```js
api.events.on('instance.entered', event => {
    api.log('Entered ' + event.location);
});
```

This example needs the `events` permission. Notifications additionally need `notifications`; UI uses `ui`. Plugins must not depend on VRCX globals or private Vue components. Host adapters handle those changing internals.

## Build and test the host

Use Node.js 24 and npm:

```sh
npm install --ignore-scripts
npm run build
npm test
```

`dist/` is a generated installable folder; it is not committed. Tests include event handling, migration, update gating, UI/lifecycle behavior and real Windows installer fixtures. Windows is required for the installer test; that test is skipped on other systems. The tests use synthetic IDs, never a live user profile.

The dependency is development-only (`jsdom`); the shipped manager has no external JavaScript runtime dependencies. CI builds and runs tests on Windows and Linux.

## Project structure

| File | Responsibility |
| --- | --- |
| `src/core.js` | Validation, presence tracking, serialized storage |
| `src/adapter.js` | VRCX-specific integration and native update guards |
| `src/host.js` | Plugin lifecycle, API permissions and manager UI |
| `src/people.js` | Built-in people-alerts plugin |
| `src/entry.js` | Startup and failure message |
| `build.mjs` | Produce the single custom.js-compatible bundle and manifest |
| `Plugin-Manager.ps1` | Reversible installation/removal |
| `API.md` | Shared API contract and upstream integration map |

## Current limits and next steps

- No sandbox for arbitrary plugin code: install only trusted plugins. Capability checks structure the API but cannot stop direct access by malicious code.
- No guaranteed full lobby roster and no historical replay alerts. Missing log records/IDs cannot be reconstructed.
- Shared subscriptions refresh on demand; there is no hosted central list service.
- No unattended combined VRCX/host installer, authenticated release feed or automatic combined rollback. Updates require a tested adapter; external installers are not intercepted.
- No VR headset end-to-end verification yet. Local tests and an isolated native VRCX startup passed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for proposed API changes, compatibility testing and pull requests. The project is licensed under [MIT](LICENSE), so others can build plugins, fork the host and contribute improvements. VRCX and VRChat are separate projects; this repository is not affiliated with their teams.
