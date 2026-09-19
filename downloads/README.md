# Installation package 1.2.0

For Windows **VRCX 2026.09.16** only. Download and extract `VRCX-Plugin-Manager-1.2.0-fuer-2026.09.16.zip`, close VRCX, and run `Installieren.cmd`. Version 1.2.0 adds direct profile-menu and Playerlist right-click actions. Tools, Game Log actions and German API/data documentation remain included. Older packages remain available as historical snapshots.

Read [the full guide](../ANLEITUNG.md) before installing over an older HTML patch. The manager uses `custom.js`; it does not replace the VRCX application. These ZIPs contain no personal lists or credentials.

This is an early community release. Eighteen local tests passed. Isolated native startup of the original host was verified; the menu integration is covered by source inspection and production-Vue DOM tests, not yet an authenticated interactive VRCX session. A real VRChat/VR-headset notification test remains outstanding. Plugins are trusted code, not sandboxed. Shared feeds refresh manually and updates require reviewed compatibility.

`SHA256SUMS` contains checksums for the installer and original source archive. The repository also includes developer documentation and CI added after that initial source archive was packaged; clone the repository for ongoing development. Checksums detect file corruption, not publisher identity.
