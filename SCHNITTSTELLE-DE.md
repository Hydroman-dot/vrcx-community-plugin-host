# VRCX-Plugin-Schnittstelle: Funktionen, Daten, Import und Export

**Stand: Host 1.3.0 / API v1, für VRCX 2026.09.16 unter Windows.**

Diese Datei richtet sich an Entwickler eigener Plugins. Die Erweiterung ist unabhängig von VRCX und nutzt dessen vorhandenen `custom.js`-Ladeweg. Sie verändert weder den VRChat-Client noch die VRCX-Programmdateien. [Englische API-Referenz](API.md) · [Installationsanleitung](ANLEITUNG.md) · [Beispiel-Plugin](examples/hello-plugin.json).

## Wo die Oberfläche sitzt

- **Tools → Plugin-Manager · Community-Plugins** öffnet Verwaltung, Personenlisten und Meldungseinstellungen.
- Seit Host 1.2.0: Direkt im **Profil-Drei-Punkte-Menü** und per **Rechtsklick in der Playerlist** markieren. Der Adapter verwendet die userId der tatsächlichen Tabellenzeile; bei nicht eindeutig auflösbarer Auswahl erscheint keine Aktion.
- Im **Game Log** erscheint oben eine Auswahl der Personen aus den geladenen Einträgen. Name und userId werden zusammen angezeigt. Die Aktionen „Warnliste umschalten“ und „Hat mich blockiert (manuell) umschalten“ speichern die Markierung direkt, ohne Kopieren einer ID oder Öffnen des Profils.
- Tabellenansicht und Sitzungsansicht werden unterstützt. Mehrere Einträge derselben userId werden zusammengefasst. Einträge ohne gültige userId werden nicht zur Markierung angeboten. Ein alter Logeintrag ist kein Beweis aktueller Anwesenheit.
- Am Anmeldebildschirm bzw. als Rückfalleinstieg bleibt der schwebende Button verfügbar. Die Einbindung unter Tools und Game Log ist Teil des versionsabhängigen Adapters.

## Was ein Plugin lesen kann

| Daten | API | Bedeutung / Grenze |
| --- | --- | --- |
| Eigenes Konto | `api.users.current()` | `{userId}`; leer bei Abmeldung. Keine Passwörter, Cookies oder Tokens. |
| Geöffnetes Profil | `api.users.selected()` | `{userId, displayName}` oder `null`. |
| Erkannte aktuelle Teilnehmer | `api.users.presence()` | Instanz, erkannte Personen, Sitzungszähler `epoch`, immer `complete:false`. Keine garantierte vollständige Lobbyliste. |
| Eigene Blocks | `api.users.blocks()` | Eigene aktive ausgehende Blocks aus VRCXs vorhandenem Cache. Keine automatische Erkennung, wer dich blockiert hat. |
| Personen im geladenen Game Log | `api.gameLog.people()` | Bis zu 10000 eindeutige Personen aus der gewählten Tabellen-/Sitzungsansicht. Keine zusätzliche Datenbankabfrage und kein vollständiger Logexport. |
| Eigene gespeicherte Werte | `api.storage.get(...)` | JSON-Daten im Namensraum dieses Plugins. |
| Manager-/Updatestatus | `api.updates.status()` | Host-/VRCX-Version, Freigaben, Update-Sperre und `automaticInstallation:false`. |
| Freigegebene externe JSON-Daten | `api.network.json(url)` | HTTPS nach Freigabe der Herkunft; keine VRCX-Anmeldedaten werden mitgeschickt. |

Ein Game-Log-Datensatz sieht beispielsweise so aus; alle Beispiel-IDs in dieser Datei sind erfunden:

```json
{
  "userId": "usr_12345678-1234-1234-1234-123456789abc",
  "displayName": "Beispielperson",
  "createdAt": "2026-09-19T12:00:00.000Z",
  "historical": true,
  "source": "game-log"
}
```

`createdAt` ist die Zeit des jüngsten geladenen Eintrags dieser ID; wenn im Ursprungsdatensatz keine Zeit vorhanden ist, bleibt sie leer. Der Game-Log-Lesezugriff spielt keine Join-Ereignisse nach und löst keine Warnungen aus.

## Welche Ereignisse verfügbar sind

Registrierung: `api.events.on(name, callback)`. Der Rückgabewert ist eine Funktion zum Abmelden. Beim Abschalten des Plugins meldet der Host seine Abonnements automatisch ab.

| Ereignis | Daten |
| --- | --- |
| `instance.entered` | `location`, `worldName`, `epoch`, `complete:false` |
| `instance.travel` | Leeres Objekt; bisherige Anwesenheit wird verworfen. |
| `instance.left` | Leeres Objekt; Spiel beendet / Verlassen erkannt. |
| `player.joined` / `player.left` | `userId`, `displayName`, `location`, `epoch`, `duringEntry`, `historical:false` |
| `account.changed` | `userId`, bei Abmeldung leer; Anwesenheit wird zurückgesetzt. |

Die Ereignisse kommen vom nativen Live-Game-Log-Callback. Alte Datenbankeinträge werden nicht als Live-Ereignisse behandelt. Doppelte Join-Meldungen während derselben Anwesenheit werden unterdrückt. `duringEntry` kennzeichnet die ersten 15 Sekunden nach einem erkannten eigenen Instanzbeitritt; es ist eine Näherung, keine garantierte zeitliche Reihenfolge der Teilnehmer.

## Was ein Plugin ausgeben oder ändern kann

| Ausgabe / Änderung | API | Ziel |
| --- | --- | --- |
| Meldung | `api.notifications.send(text)` | Bestehender VRCX-Benachrichtigungsweg: VR-Overlay, Desktop und/oder TTS entsprechend den VRCX-Einstellungen. |
| Einstellungsseite | `api.ui.page(definition)` | Deklarative Felder, Aktionen und Textzeilen im Manager. |
| Nutzeraktion | `api.ui.userAction({id,label,run})` | Aktion im Profil-Drei-Punkte-Menü, im Playerlist-Rechtsklickmenü, im Manager für das geöffnete Profil und für die ausgewählte Game-Log-Person. |
| Oberfläche aktualisieren | `api.ui.refresh()` | Eigene Manager-Seite neu rendern; ungespeicherte Feldänderungen werden dabei ersetzt. |
| Rückfrage | `api.ui.confirm(text)` | Bestätigung vor einer gewünschten Änderung. |
| JSON-Datei exportieren | `api.ui.download(name,value)` | Lokaler Browserdownload. Kein Upload an andere Personen. |
| JSON-Daten speichern | `api.storage.set(key,value,scope)` | Eigener lokaler Namensraum; keine Änderung fremder Plugins über die API. |
| Diagnose | `api.log(text)` | Begrenztes Sitzungsprotokoll im Manager. |

Die API bietet **keine** VRChat-Moderationsschreibzugriffe, kein automatisches Blockieren/Entblockieren, keine Nachrichten an andere Nutzer, keine Anmeldedaten und keine automatische Freigabe nativer Updates. Die manuelle Kategorie „Hat mich blockiert“ bleibt eine Angabe des Benutzers.

## Speicherung

```js
await api.storage.set('settings', { enabled: true });
const settings = await api.storage.get('settings', { enabled: false });

await api.storage.set('accountSettings', { enabled: true }, 'account');
```

`local` ist der Standard: Daten gelten für diesen VRCX-Datenordner. `account` bindet den Schlüssel an die aktuell angemeldete userId und schlägt ohne Anmeldung fehl. Schlüssel bestehen aus 1–80 Buchstaben, Ziffern, Unterstrichen oder Bindestrichen. Pro Wert gelten maximal 2 MB serialisiertes JSON. Schreibvorgänge werden nacheinander ausgeführt; Fehler werden an das Plugin zurückgegeben. Abmeldung während asynchroner Arbeit muss das Plugin berücksichtigen.

Speicherung ist JSON-basiert: keine Funktionen, Maps oder Sets. Beim Entfernen eines Plugins bleiben seine gespeicherten Daten erhalten. Die Namensräume sind API-Konventionen, keine Sandbox gegen absichtlich direkt auf VRCX zugreifenden Code.

## Daten einspielen

1. **Plugin-Paket:** JSON-Datei in der Plugin-Verwaltung auswählen. Manifest, API-Version und VRCX-Freigabe werden geprüft; Installation des Codes wird bestätigt. Dieselbe ID aktualisiert das Plugin.
2. **Geteilte Personenliste:** JSON in das Feld der Personenlisten-Seite kopieren und importieren. Sie bleibt als eigene Quelle getrennt von lokalen Kategorien.
3. **HTTPS-Liste:** URL hinzufügen und Herkunft freigeben. Aktualisieren erfolgt per Knopfdruck. Der Inhalt ersetzt genau diese Quelle, einschließlich entfernter IDs; ein Abruffehler behält den letzten erfolgreichen Stand.
4. **Personenlisten-Sicherung:** JSON in das Feld kopieren und Wiederherstellen wählen. Ersetzt nach Bestätigung die lokalen Kategorien, Meldungen und Quellen.
5. **Manager-Sicherung:** JSON-Datei in der Verwaltung auswählen. Enthaltene Plugin-Pakete werden geprüft und nach Bestätigung übernommen. Netzwerkfreigaben werden zurückgesetzt; der laufende Update-Schutz bleibt erhalten. Plugin-Daten werden damit nicht wiederhergestellt.

Format einer geteilten Liste:

```json
{"name":"Freundesgruppe","userIds":["usr_12345678-1234-1234-1234-123456789abc"]}
```

Format einer privaten Personenlisten-Sicherung:

```json
{
  "kind": "vrcx-people-backup",
  "data": {
    "version": 3,
    "userIds": [],
    "blockedMeUserIds": [],
    "notifyBlockedUsers": true,
    "messageTemplates": {"general":"Achtung: {name} ist in deiner Instanz."},
    "sources": []
  }
}
```

Vorlagen-Schlüssel: `general`, `blocked_me`, `blocked_by_me`, `shared`. Platzhalter: `{name}`, `{userId}`, `{category}`. Je Vorlage maximal 300 Zeichen.

Ein eigenes Plugin kann JSON z. B. über ein `textarea` seiner Seite entgegennehmen, mit `JSON.parse` lesen, das eigene Schema prüfen und mit `api.storage.set` speichern. Es gibt keinen allgemeinen ungeprüften Datenbankimport.

## Daten ausgeben / sichern

- **Meine Warnliste teilen:** nur die allgemeine manuelle Liste als `name`/`userIds`; keine automatische Veröffentlichung.
- **Alle Listen und Meldungen sichern:** vollständige Personenlisten-Sicherung einschließlich manueller „Hat mich blockiert“-Liste und Quellen. Diese Datei kann persönliche Angaben enthalten.
- **Manager-Einstellungen exportieren:** installierte Plugin-Pakete, Aktivierung und Manager-Einstellungen; keine vollständige Sicherung der Daten aller Plugins.
- **Eigene Plugin-Exporte:** `api.ui.download('mein-export.json', validierteDaten)`.

Keine HTTP-Upload-/POST-Funktion gehört zu API v1. `api.network.json` liest nur. Einen gemeinsamen öffentlichen Listenserver liefert der Manager nicht mit.

## Berechtigungen und Beispiel

Mögliche Manifest-Berechtigungen: `events`, `users`, `blocks`, `gamelog`, `storage`, `notifications`, `ui`, `network`, `updates`. `gamelog` wird für `api.gameLog.people()` benötigt; `blocks` für eigene Blocks. Fehlende Berechtigungen führen zu Fehlern.

```json
{
  "manifest": {
    "id": "mein-log-plugin",
    "name": "Game-Log-Export",
    "version": "1.0.0",
    "apiVersion": 1,
    "vrcxVersions": ["2026.09.16"],
    "permissions": ["gamelog", "ui"]
  },
  "code": "api.ui.page({id:'export',title:'Game-Log-Export',render:()=>({description:'Exportiert Personen aus den aktuell geladenen Logeinträgen.',actions:[{id:'export',label:'JSON herunterladen'}]}),onAction:async action=>{if(action==='export')api.ui.download('game-log-personen.json',api.gameLog.people());}});"
}
```

Dieser Export betrifft die geladenen Personen, nicht den gesamten VRCX-Logverlauf. Die Datei kann userIds und Namen enthalten; das Plugin lädt sie nicht automatisch hoch.

## Laufzeit und Grenzen

`code` ist der Körper einer asynchronen Aktivierungsfunktion mit Parameter `api`. Für eigene Ressourcen `api.lifecycle.onDispose(fn)` nutzen oder eine Aufräumfunktion zurückgeben. Eigene Timer müssen bereinigt werden. Drei Fehler in Ereignissen/Aktionen pausieren das Plugin für diese Sitzung.

Plugins laufen als **vertrauenswürdiger JavaScript-Code im VRCX-Kontext**, ohne Sicherheits-Sandbox. Die API-Prüfungen verhindern kein absichtliches Umgehen über globale Objekte. Nur geprüften Code installieren. Updates auf unbekannte VRCX-Versionen pausieren Plugins; künftige Kompatibilität ist nicht garantiert.

Der Meldungsweg respektiert VRCXs Einstellungen und kann bei „Beschäftigt“ oder noch nicht abgeschlossener Anmeldung unterdrückt werden. Ein echter Headset-Ende-zu-Ende-Test steht noch aus. Ein unbeaufsichtigter gemeinsamer VRCX-/Manager-Updater und ein zentraler Plugin-Marktplatz sind nicht enthalten.
\n\n## API-gekoppelte Plugins und LAN-Zugriff (Host 1.3.0)\n\nPlugins, die ausschließlich die dokumentierte Community-Host-API verwenden, können im Manifest `hostApiOnly:true` setzen und `vrcxVersions` weglassen. Damit muss das Plugin bei einem normalen VRCX-Update nicht neu veröffentlicht werden; nur der versionsabhängige Host-Adapter muss die neue VRCX-Version freigeben.\n\nFür lokale Begleitdienste gibt es die Berechtigung `lan` und `api.lan.json(...)`. Erlaubt sind nur HTTP-Ziele auf `localhost`, `.local`, privaten IPv4-Netzen oder Link-Local. Die Herkunft wird einmal bestätigt; Cookies und Redirects sind deaktiviert. Ein optionales Bearer-Token kann mitgegeben werden.\n