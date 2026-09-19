# Contributing

Plugin examples, bug fixes, tests and API proposals are welcome. Use issues to discuss API changes before expanding the shared contract.

## Local workflow

1. Fork and clone the repository.
2. Install Node 24 and run `npm install --ignore-scripts`.
3. Run `npm run build` and `npm test`.
4. Make a focused branch and submit a pull request explaining behavior and validation.

The installer test uses isolated fixture directories and mocks process inventory. Do not point tests at a real VRCX profile. Never commit profiles, SQLite databases, personal lists, logs, cookies or tokens. All sample user IDs must be synthetic.

## API and compatibility

- Keep plugins on the public API documented in `API.md`; put VRCX-specific changes in `src/adapter.js`.
- New API capabilities need a documented contract, permission checks where applicable, and useful tests.
- Do not silently break API v1. Propose a new major version for incompatible changes and document migration.
- A VRCX version must be inspected and tested before adding it to the compatibility list. Do not use wildcards or infer compatibility from dates.
- Test instance transitions, leave/rejoin, account changes, stale logs, duplicate joins, disabled plugins and failed storage writes.
- Treat received JSON and display names as untrusted data. Keep credentials out of plugin APIs and network requests.
- Do not add incoming-block detection, hidden-state inference or VRChat client modifications.
- Keep third-party plugins explicitly trusted; do not describe this same-page runtime as sandboxed.

## Packaging

`npm run build` produces `dist/`. Installer ZIPs in `downloads/` are reviewed snapshots with SHA-256 checksums. A checksum detects corruption; it is not a publisher signature. Changes to shipping code require a new reviewed package, corresponding version and release notes. Do not upload test fixtures or `node_modules`.

Before calling a release compatible, run the Windows tests, test startup in an isolated real VRCX data directory, and document whether a real VRChat/SteamVR overlay test was performed. Do not claim untested delivery or future compatibility.

## Reports

Include host/API/VRCX versions, expected behavior and minimal reproduction steps. Redact personal user IDs and private instance identifiers. Do not post credentials, session cookies, database dumps or raw personal log files.
