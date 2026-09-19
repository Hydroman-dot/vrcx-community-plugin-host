# Community Plugin API v1

Host 1.2.0, Windows VRCX 2026.09.16. This is an independent community API built on VRCX's existing `custom.js` loader. It is not an upstream-supported stability contract. [Deutsche Schnittstellenbeschreibung](SCHNITTSTELLE-DE.md).

## Package and lifecycle

A JSON package has `manifest` and `code`. See `examples/hello-plugin.json`. Required manifest properties:

```json
{
  "id": "my-plugin",
  "name": "My plugin",
  "version": "1.0.0",
  "apiVersion": 1,
  "vrcxVersions": ["2026.09.16"],
  "permissions": ["events", "users", "storage", "notifications", "ui"]
}
```

IDs: 3–64 lowercase letters/digits/hyphens, starting with a letter. Versions: three numeric components. Supported VRCX versions are explicit exact release dates, not inferred ranges. Unknown API majors, permissions and incompatible releases are rejected. API v1 is the shared contract; implementation details of `$pinia` are not part of it.

`code` is the body of an async activation function receiving `api`. It runs once on activation. It may return a synchronous cleanup function. Also use `api.lifecycle.onDispose(fn)`. Cleanups run in reverse registration order on disable/remove/update. The host unregisters API events, pages and user actions; a plugin must clean up its own timers/resources. API methods reject calls after deactivation. Storage operations already queued may complete. Packages execute trusted local JavaScript in the page: this is **not a sandbox**. Do not access VRCX globals directly or retain state after disposal.

Activation errors stop that plugin. Three event/action errors stop it for the session. State remains installed for a later retry. Synchronous infinite loops and malicious direct access are not isolated. Diagnostic messages are held only in memory and capped at 80 entries.

## API

| API | Permission | Contract |
| --- | --- | --- |
| `api.version`, `api.hostVersion` | none | Major API number and host version. |
| `api.events.on(name, handler)` | events | Registers async/sync handler, returns unsubscribe; automatic cleanup. |
| `api.users.current()` | users | `{userId}`, empty string when signed out. |
| `api.users.selected()` | users | `{userId,displayName}` from the open VRCX profile, or null. |
| `api.users.presence()` | users | `{location,players,complete:false,epoch}` from live events observed since a known instance entry. Never a guaranteed complete lobby snapshot. |
| `api.users.blocks()` | blocks | Copy of current user's active outgoing VRChat blocks known to VRCX: `[{userId,displayName}]`. No incoming-block detection. |
| `api.gameLog.people()` | gamelog | Since host 1.1.0: copies of up to 10000 unique users from loaded rows in the selected table/session mode. `{userId,displayName,createdAt,historical:true,source:'game-log'}`. No extra database query or live event replay. |
| `await api.storage.get(key,fallback=null,scope='local')` | storage | JSON value. Keys: 1–80 letters/digits/underscores/hyphens. |
| `await api.storage.set(key,value,scope='local')` | storage | Serialized JSON writes, 2 MB per value, errors propagated. |
| `api.notifications.send(text)` | notifications | Sends 1–1800 characters through VRCX `External`. Max 25 per plugin per 10 seconds; excess dropped with diagnostics. No delivery guarantee. |
| `api.ui.page(definition)` | ui | Register/replace a declarative page; see below. |
| `api.ui.userAction({id,label,run})` | ui | Adds an action for the currently open VRCX profile inside the manager and, since host 1.1.0, the person selected in the Game Log toolbar. `run(person)` receives a snapshot. Since host 1.2.0, actions also appear in the profile three-dot menu and a Playerlist row right-click menu. The adapter resolves the exact userId from the keyed live table row, never its display name or row index. A changed account/selection or removed action prevents execution. Native UI integration is specific to the supported VRCX version. |
| `api.ui.refresh()` | ui | Renders manager again if open. Unsaved field edits are not retained after rerender. |
| `api.ui.confirm(text)` | ui | Returns confirmation Boolean. |
| `api.ui.download(filename,jsonValue)` | ui | JSON browser download. |
| `await api.network.json(httpsUrl)` | network | User-approved origin; no cookies, no redirects, 15 s timeout, 2 MB maximum streamed body, JSON response. Grants are per plugin and origin. Host can revoke grants. |
| `api.updates.status()` | updates | `{vrcxVersion,hostVersion,held,supportedVrcxVersions,compatible,automaticInstallation:false}`. Read-only; plugins cannot release host update protection through API v1. |
| `api.lifecycle.onDispose(fn)` | none | Register synchronous cleanup. |
| `api.log(text)` | none | Prefixes plugin name in host session diagnostics. |

`scope` is `local` (this VRCX data directory) or `account` (current account userId, errors while signed out). Storage keys are namespaced by plugin ID and scope/account. It is cooperative namespace isolation, not a security boundary against direct database access. Capture account identity before asynchronous work and discard results if it changed. Values are copied through JSON; Map/Set/functions are not supported. No direct credentials, moderation writes or privileged native API are exposed.

The built-in people plugin has a private migration helper `storage.legacyPeople()` restricted to its ID. This is not a third-party extension point.

## Events

| Name | Payload |
| --- | --- |
| `instance.entered` | `{location,worldName,epoch,complete:false}`; start of a known instance session. |
| `instance.travel` | `{}`; clear prior presence while traveling. |
| `instance.left` | `{}`; VRChat stopped / quit detected. |
| `player.joined` | `{userId,displayName,location,epoch,duringEntry,historical:false}`. |
| `player.left` | Same fields. |
| `account.changed` | `{userId}`, empty when signed out. Clears presence. |

Events come only from the native live game-log callback. Database replay does not enter this bridge. Native timestamps older than 60 seconds or over five seconds in the future are rejected. Only valid user IDs are accepted. Self-events are omitted. Duplicate join records are suppressed while present; actual leave/rejoin can notify again. `duringEntry` is a 15-second heuristic for the initial roster, not a claim about who entered first. Missing logs/IDs cannot be reconstructed. Account and game-running state are checked on live logs and polled once a second for resets. No hidden inbound-block information is read or inferred.

## Declarative pages

```js
api.ui.page({
  id: 'settings', title: 'My settings',
  render: () => ({
    description: 'Description', hint: 'Optional help',
    fields: [{id:'message',label:'Message',type:'text',value:'Hello',maxLength:300}],
    actions: [{id:'save',label:'Save'}],
    rows: [{text:'A result',action:'remove:1',label:'Remove'}]
  }),
  onAction: async (action, values) => {
    if (action === 'save') await api.storage.set('message', values.message);
  }
});
```

Field types: text, textarea, checkbox. Values are strings or checkbox Booleans. Display uses DOM `textContent`, not untrusted HTML. Up to 100 fields, 50 actions and 20000 rows per render. `render` is synchronous and must not mutate UI or call `refresh`. Page IDs are scoped to the plugin. All plugins share a host-rendered Shadow DOM panel to avoid depending on VRCX's changing Vue component tree.

## Lists and interoperability

Portable shared list schema is `{name:string,userIds:string[]}`; maximum 10000 valid unique VRChat userIds. No incoming-block factual claim is attached to a shared entry. The built-in plugin adds local provenance metadata `{url,updatedAt,enabled}` and keeps each source distinct. Manual refresh replaces one source, including deletions. It does not overwrite local categories. Public upload and a central registry are not implemented.

Built-in local storage key: `CommunityPlugin_people-alerts_local_lists`. Data model:

```json
{"version":3,"userIds":[],"blockedMeUserIds":[],"notifyBlockedUsers":true,"messageTemplates":{},"sources":[]}
```

Template keys: `general`, `blocked_me`, `blocked_by_me`, `shared`. Single-pass placeholders `{name}`, `{userId}`, `{category}` avoid reinterpreting inserted user names. Defaults apply for missing templates. Old keys `VRCX_PersonWatchlist_v2` and `_v1` are read only when the new key is absent, and are not deleted. Shared list export includes only general manual IDs; full private backups include the whole model with envelope `{kind:'vrcx-people-backup',data:...}`.

Host settings: `VRCX_CommunityHost_v1`. ConfigRepository lowercases underlying keys and prefixes `config:`. Installed plugin code, enable flags, origin grants, prior update mode and hold preference persist here. Use UI/package import, not direct editing, for routine changes.

## Adapter and upstream source map

Reviewed upstream: [tag v2026.09.16](https://github.com/vrcx-team/VRCX/tree/v2026.09.16), commit `1bf052f84c670b96bfe44156e097eb668ae78de7`.

| Upstream file | Integration point |
| --- | --- |
| `Dotnet/AppApi/Common/AppApiCommon.cs` | `CustomScript()` reads user data directory/custom.js. `GetVersion()` returns `VRCX 2026.09.16`, including prefix. |
| `src/shared/utils/base/ui.js` | `refreshCustomScript()` injects existing custom.js. |
| `src/stores/vrcx.js` | Calls script loader after database initialization. |
| `src/App.vue`, `src/stores/index.js` | Create and expose `window.$pinia`; coordinator assigned to gameLog store. |
| `src/coordinators/gameLogCoordinator.js` | Live `addGameLogEvent(json)` bridge. Original handler always runs first. |
| `src/services/gameLog.js`, `Dotnet/LogWatcher.cs` | Raw array `[recordId,dt,type,...args]`; location and player-joined/left arguments. |
| `src/stores/user.js`, `src/stores/moderation.js` | Current/open-profile user and outgoing moderation cache. |
| `src/services/config.js` | Async serialized local storage via `window.configRepository`. |
| `src/stores/notification/index.js` | `playNoty({type:'External',message,created_at})`; busy/readiness/preferences still apply. |
| `src/stores/notification/overlayDispatch.js` | Existing Desktop, SteamVR, XSOverlay, OVR Toolkit delivery. |
| `src/shared/utils/notificationMessage.js`, `src/vr/Vr.vue` | Existing External text rendering, including overlay escaping. No patched HTML required. |
| `src/stores/vrcxUpdater.js` | Auto-update preference and native DownloadUpdate/RestartApplication calls. |

Our `src/adapter.js` is the only module that knows these internals. Its navigation bridge mounts an owned entry into `#chart .options-container` on `#/tools` and a person-action toolbar into the active `.x-container.x-container--auto-height` on `#/game-log`. It reads `gameLogTableData` / `sessionsSegments.events` including aggregate members, never guesses IDs from DOM names, and removes owned nodes on disposal. Other files: `core.js` validation/presence/storage, `host.js` lifecycle/permissions/manager UI, `people.js` built-in plugin, `entry.js` bootstrap. `build.mjs` concatenates these controlled ESM modules into one IIFE for custom.js. No third-party runtime dependencies or VRCX build are required.

## Development and compatibility releases

Node 24 was used. Install the pinned jsdom development dependency with your package manager, then `node build.mjs` and `node --test tests/*.test.mjs`. The local workspace tests can reuse an existing adjacent VRCX node_modules; a standalone source distribution needs its own dependencies. Installer tests are Windows-only and mock process inventory but use real temporary fixture files. They never alter the real VRCX profile.

Before adding a new VRCX version, inspect the upstream paths above, verify actual native method names/version format, run unit/UI/installer tests and an isolated real startup, and test VRChat/VR output. Only then change `SUPPORTED_VRCX` and the built-in/plugin manifests. There is no wildcard bypass or automatic assumption of compatibility.

Update gating is defense against ordinary application updates after host initialization, not a security boundary. A first-run startup download may begin before custom.js loads. External installers are not intercepted. API v1 deliberately exposes update status, not autonomous installer execution. An authenticated manager-release source, signed distribution policy and coupled automatic rollback would be separate infrastructure; this package supplies none and does not claim them.
