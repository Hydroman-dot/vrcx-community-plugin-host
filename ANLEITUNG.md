# VRCX Community-Plugin-Manager 1.1.0

Stand: 19. September 2026. Freigegeben für die Windows-Ausgabe **VRCX 2026.09.16**.
Dies ist eine unabhängige Community-Erweiterung, kein offizielles VRCX-Plugin-System.

## Installation

1. ZIP vollständig in einen beliebigen Ordner entpacken.
2. VRCX vollständig beenden, auch im Windows-Infobereich.
3. `Installieren.cmd` doppelklicken.
4. VRCX starten. Unter **Tools → Plugin-Manager · Community-Plugins** findest du den Manager. Am Anmeldebildschirm bleibt **Plugins · Personenlisten** als Rückfalleinstieg sichtbar.

Die Installation ergänzt `%APPDATA%\VRCX\custom.js`. Sie ersetzt weder VRCX.exe noch die HTML-Oberfläche und benötigt normalerweise keine Administratorrechte. Vorhandener eigener Code außerhalb des markierten Manager-Blocks bleibt erhalten. Sicherungen liegen im VRCX-Benutzerordner unter `community-plugin-backups`. Ein Fehler in einem vorher vorhandenen eigenen Skript kann auch den nachfolgenden Manager am Start hindern.

Für einen anderen Installationsordner oder ein mit `--config` gestartetes VRCX:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Plugin-Manager.ps1 -Mode Install -InstallPath 'D:\Apps\VRCX' -ConfigPath 'D:\MeineVRCXDaten'
```

Ein alter Personenlisten-Patch, der die HTML-Oberfläche ersetzt hat, muss zunächst mit seinem passenden Paket entfernt werden. Der Installer stoppt bei dessen Markierungsdatei. **Nach einem VRCX-Update niemals eine alte HTML-Sicherung über die neue Version kopieren.** In diesem Fall die offizielle Installation reparieren und die persönlichen VRCX-Daten behalten. Der neue Manager kann die gespeicherten Listen aus v1/v2/v3 des alten Patches übernehmen.

## Personen markieren und Meldungen bearbeiten

- Direkt im **Game Log** oben eine Person aus den geladenen Einträgen auswählen und die gewünschte Listen-Aktion anklicken. Name und userId werden gemeinsam angezeigt. Das funktioniert in Tabellen- und Sitzungsansicht; es ist keine Änderung am nativen Rechtsklickmenü.
- Alternativ das VRCX-Profil öffnen, danach **Tools → Plugin-Manager**. Oben stehen Aktionen für dieses Profil.
- Alternativ auf der Seite **Personenlisten** die vollständige `usr_…`-ID eingeben.
- **Warnliste**: frei gewählte lokale Markierungen.
- **Hat mich blockiert**: ausschließlich manuelle Einträge. Es wird nicht geprüft oder rekonstruiert, ob diese Person dich tatsächlich blockiert hat.
- **Von mir blockiert**: deine eigenen aktiven VRChat-Blocks, die VRCX bereits kennt. Entfernen dieser Blocks erfolgt in VRChat/VRCX; das Plugin ändert keine Moderationen.

Die Listen gelten lokal für diesen VRCX-Datenordner. Eigene VRChat-Blocks werden immer anhand des gerade angemeldeten Kontos gelesen.

Im selben Menü kannst du die Meldungen für jede Kategorie und geteilte Listen bearbeiten. Platzhalter sind `{name}`, `{userId}` und `{category}`. **Meldungen speichern** übernimmt die Einstellungen, **Standardmeldungen** setzt die Texte zurück. **Testmeldung senden** nutzt denselben VRCX-Benachrichtigungsweg.

Meldungen werden beim Beitritt einer markierten Person und beim eigenen Beitritt ausgelöst, sobald VRChat deren Anwesenheit im Live-Log mit gültiger userId meldet. Ein erneuter Beitritt nach einem tatsächlichen Verlassen kann erneut warnen. Mehrere Kategorien werden zu einer Meldung zusammengefasst. Alte Datenbank-Logs lösen keine Warnungen aus.

Es gibt keine garantierte vollständige Teilnehmerliste: Fehlende userIds, nicht geloggte Teilnehmer oder ein erst nach deinem Instanzbeitritt gestartetes VRCX können nicht zuverlässig nachträglich erkannt werden. Der Manager rekonstruiert keine Blockierungsinformationen und verändert den VRChat-Client nicht.

In VRCX müssen deine gewünschten Benachrichtigungen aktiviert sein: Overlay/XSOverlay/OVR Toolkit, Desktop und/oder TTS. Der Manager nutzt VRCXs vorhandenen Typ `External`. „Beschäftigt“, noch nicht abgeschlossene Anmeldung und VRCXs Benachrichtigungseinstellungen können die Ausgabe unterdrücken. Es handelt sich um eine VRCX-/VR-Overlay-Meldung, nicht um einen Eingriff in VRChats eigene Oberfläche.

## Gemeinsame Listen

**Meine Warnliste teilen** exportiert nur die allgemeine Warnliste. Nichts wird automatisch hochgeladen. Die anderen beiden Kategorien werden damit nicht geteilt.

Eine Datei deiner Freunde kann in das JSON-Feld kopiert und mit **Geteilte Liste importieren** eingelesen werden:

```json
{"name":"Liste unserer Freundesgruppe","userIds":["usr_12345678-1234-1234-1234-123456789abc"]}
```

Für ein Abo gibst du eine von euch bereitgestellte HTTPS-Adresse mit demselben JSON-Format an und klickst **Listen-Abo hinzufügen**. Vor dem ersten Zugriff wird die Herkunft angezeigt und freigegeben. Der Abruf enthält keine VRCX-Cookies oder Konto-Zugangsdaten; der Server sieht wie bei jedem Abruf deine IP-Adresse. Weiterleitungen werden abgelehnt, maximal 2 MB werden eingelesen. Der Server muss den Abruf technisch zulassen; es gibt keinen eingebauten Proxy.

Abos werden in dieser Version **auf Knopfdruck** aktualisiert. Eine Aktualisierung ersetzt den bisherigen Inhalt dieser Quelle, einschließlich entfernter Einträge. Eine fehlgeschlagene Aktualisierung lässt die letzte erfolgreiche Liste erhalten. Jede Quelle zeigt Namen, Adresse, letzten erfolgreichen Abruf und Aktiv/Pause. Die Listen sind Angaben der jeweiligen Quelle und keine vom Manager geprüften Tatsachen.

Es gibt keinen zentralen öffentlichen Listenserver und keine automatische Veröffentlichung. Zum Beenden eines Abos dessen Liste entfernen; Netzwerkfreigaben lassen sich zusätzlich in der Plugin-Verwaltung zurücksetzen.

## Eigene Plugins

In **Plugin-Verwaltung** ein JSON-Paket auswählen. Name, Version und beantragte API-Berechtigungen werden vor der Installation angezeigt. Dieselbe Plugin-ID aktualisiert ein installiertes Plugin. Aktivieren, Deaktivieren und Entfernen sind im Menü möglich. Deaktivierung entfernt Ereignisabonnements, Seiten und Nutzer-Aktionen. Drei Fehler in Ereignissen/Aktionen pausieren das betroffene Plugin für diese Sitzung. Gespeicherte Daten bleiben beim Entfernen erhalten.

`examples/hello-plugin.json` ist ein lauffähiges kleines Beispiel. `API.md` beschreibt die gemeinsame API für dich und deine Freunde.

`SCHNITTSTELLE-DE.md` beschreibt auf Deutsch alle verfügbaren Daten, Berechtigungen, Import-/Exportformate und Beispiele. `examples/game-log-export.json` zeigt den Export der Personen aus geladenen Logeinträgen. Die neue Game-Log-/Tools-Einbindung wurde anhand des aktuellen Quellcodes und mit DOM-Tests geprüft; ein interaktiver Test in einem angemeldeten VRCX steht noch aus.

**Nur vertrauenswürdige Plugins installieren.** Plugins laufen im JavaScript-Kontext von VRCX und könnten technisch auf dessen Sitzung zugreifen. Die API-Berechtigungen sind Kontrollen für korrekt geschriebene Plugins, keine technische Sandbox. Endlosschleifen oder absichtlich umgangene API-Regeln lassen sich damit nicht isolieren. Es gibt weder einen geprüften Plugin-Marktplatz noch digitale Herausgebersignaturen. Die Paket-Prüfsumme erkennt Übertragungsfehler, nicht einen böswilligen Herausgeber.

## Updates

Der Manager hält VRCXs automatische Updates an, indem er die Einstellung auf `Off` setzt und nach seinem Start native Download- und Upgrade-Neustartaufrufe sperrt. VRCX lädt `custom.js` erst nach einem Teil seiner Initialisierung: Beim allerersten Start kann eine zuvor aktivierte Update-Prüfung/ein Download schon angelaufen sein. Der Schutz ist keine systemweite Sperre gegen externe Installer, fremde Skripte oder VRCX-Versionen mit geänderten nativen Updatewegen.

**Offizielle VRCX-Version prüfen** liest die neueste stabile GitHub-Veröffentlichung. Es installiert nichts. Nur VRCX 2026.09.16 ist für diesen Manager freigegeben. Unbekannte Versionen starten keine Plugins; ein funktionsfähiger Update-Schutz und das Verwaltungsmenü bleiben nach Möglichkeit verfügbar.

Der sinnvolle Ablauf ist jetzt:

1. Alle Listen und Meldungen sichern.
2. Einen für die neue VRCX-Version geprüften Manager bereithalten.
3. **Updates freigeben und Plugins pausieren** wählen.
4. VRCX regulär aktualisieren und schließen.
5. Das passende neue Manager-Paket installieren und den Update-Schutz im Menü aktivieren, wenn du ihn zuvor freigegeben hast.

Die Erweiterung bleibt bei einem normalen VRCX-Update im Benutzerordner liegen. Ein automatisches Entfernen und Wiederaufspielen der gesamten Oberfläche ist dadurch nicht mehr nötig. Eine VRCX-Deinstallation mit Löschung der Benutzerdaten entfernt dagegen auch Listen und Manager; vorher sichern.

**Noch nicht enthalten:** ein unbeaufsichtigter Update-Dienst, der neue Manager-Versionen herunterlädt, authentifiziert, zusammen mit VRCX installiert und beide automatisch zurückrollt. Dafür gibt es bisher keine von euch festgelegte vertrauenswürdige Veröffentlichungsquelle. Eine neue Versionsnummer wird niemals automatisch als kompatibel eingestuft. Die API bietet Update-Status und Netzwerk-/UI-Bausteine für künftige Update-Plugins; das Freigeben nativer Updates bleibt beim Manager und Nutzer.

## Sicherung, Entfernung und Wiederherstellung

Auf der Personenlisten-Seite **Alle Listen und Meldungen sichern** wählen. Diese Sicherung enthält lokale Kategorien, Texte und abonnierte Quellen. Zum Wiederherstellen die JSON-Datei in das JSON-Feld kopieren und **Sicherung aus JSON wiederherstellen** wählen; das Ersetzen wird bestätigt.

Der Manager-Einstellungsexport sichert zusätzlich installierte Plugin-Pakete und deren Aktivierung. **Manager-Sicherung wiederherstellen** zeigt vor dem Ersetzen die enthaltenen Plugins und Berechtigungen an. Netzwerkfreigaben werden dabei zurückgesetzt; der aktuelle Update-Schutz wird nicht aus der Sicherung überschrieben. Personenlisten und andere Plugin-Daten bleiben separat gespeichert und benötigen ihre eigene Sicherung.

Zum Entfernen VRCX schließen und **Entfernen.cmd** starten. Eigener Code bleibt erhalten, Listen werden nicht gelöscht. Ein kleiner Wiederherstellungsblock in `custom.js` stellt beim nächsten Start einmalig die frühere VRCX-Update-Einstellung wieder her und ist danach inaktiv. Er wird bei der nächsten Manager-Installation ersetzt. Die Sicherung der ursprünglichen Datei liegt in `community-plugin-backups`; beim manuellen Zurückspielen spätere eigene Änderungen berücksichtigen.

## Geprüft und offen

- Automatisierte Tests: Live-Join/Leave, eigener Instanzwechsel, doppelte und alte Ereignisse, Kontowechsel, Datenmigration, Meldungstexte, geteilte Listen, Speicherfehler, Plugin-Lebenszyklus, API-Prüfung und Update-Sperre.
- Oberfläche mit einer Test-VRCX-Umgebung geprüft; Installation, wiederholte Installation und Entfernung in echten separaten Windows-Testordnern geprüft, einschließlich Erhalt vorhandener Skripte, beschädigter Pakete, unbekannter Version und Verzeichnisverknüpfungen.
- Echter Start der installierten VRCX-Version 2026.09.16 mit separatem leeren Datenordner: Manager aktiv, Personenlisten-Plugin aktiv, Update-Schutz aktiv, Personenlisten-Menü mit acht Eingabefeldern vorhanden.
- Noch kein echter VRChat-/SteamVR-Ende-zu-Ende-Test. Im isolierten Testprofil fehlen Anmeldung und nutzbare Overlay-Verbindung; Netzwerkzugriffe waren in der Testumgebung eingeschränkt. Die sichtbare Meldung im Headset muss nach Installation vor Ort geprüft werden.

Offizieller überprüfter Quellstand: [v2026.09.16](https://github.com/vrcx-team/VRCX/tree/v2026.09.16), Commit `1bf052f84c670b96bfe44156e097eb668ae78de7`.
