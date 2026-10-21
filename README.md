# agenten-monitor

Eine Mod für Claude Code, die in einem Pane zeigt, woran die Agenten einer Session gerade arbeiten. Statt auf ein stummes „Agent läuft“ zu warten, siehst du je Agent eine Fortschrittsleiste, den aktuellen Schritt und den letzten Tool-Aufruf.

## Voraussetzungen

- Claude Code mit Unterstützung für Hooks-Module (Mods). Diese API ist im Early Access und kann sich ändern. Entwickelt und getestet wurde die Mod mit Claude Code 2.1.304.
- Die Mod zeigt Subagenten, also Agenten, die Claude über das Werkzeug `Agent` startet. Die Hauptsession selbst erscheint nicht im Pane.

## Installation

Im Prompt einer Terminal-Session:

```
/plugin install agenten-monitor --marketplace Julianspk/agenten-monitor
```

Aus einer Shell:

```
claude plugin install agenten-monitor --marketplace Julianspk/agenten-monitor
```

In der Desktop-App, wo `/plugin` nicht läuft: auf + neben dem Prompt-Feld klicken, dann Plugins, Add marketplace mit `Julianspk/agenten-monitor`, dann Add plugin.

Ablauf bei der Installation:

1. Claude Code fragt `Add marketplace?` und nennt `github:Julianspk/agenten-monitor`. Mit `y` bestätigen.
2. Einen Gültigkeitsbereich wählen, zum Beispiel den für deinen Benutzer.
3. Danach steht `Installed agenten-monitor. Plugin is now active.` Die Mod ist sofort aktiv. Optionen gibt es keine.

Prüfen, ob die Mod läuft: `/agenten` eingeben. Die Antwort ist `Agenten-Pane geöffnet.`, und das Pane `Agenten` geht auf.

## Benutzung

Du musst nichts tun. Sobald Claude einen Agenten startet, öffnet sich das Pane `Agenten` von selbst und zeigt ihn als Karte. Laufende Agenten stehen oben, danach die übrigen, die neuesten zuerst. Über den Karten steht, wie viele Agenten laufen, fertig oder abgebrochen sind.

Aufbau einer Karte:

| Zeile | Inhalt | Beispiel |
| --- | --- | --- |
| Kopf | Status, Aufgabe des Agenten, Laufzeit | `● Doku lesen   1:23` |
| Leiste | Fortschritt in Prozent | `40 %` |
| Schritt | aktueller Schritt, vom Agenten gemeldet oder aus seiner Todo-Liste | `› Tests ausführen` |
| Aktivität | letzter Tool-Aufruf als verständliche Zeile | `Read: app.ts lesen` |
| Fußzeile | Modell, Agententyp, Quelle des Fortschritts, Zahl der Tool-Aufrufe | `Haiku 4.5 · Explore · 2/5 Schritte · 3 Tool-Aufrufe` |

Status und Farben:

| Symbol | Status | Bedeutung |
| --- | --- | --- |
| `●` orange | läuft | der Agent arbeitet, die Laufzeit zählt jede Sekunde weiter |
| `✓` grün | fertig | der Agent hat sein Ergebnis übergeben |
| `✕` rot | abgebrochen | der Agent endete ohne Ergebnis, etwa durch Abbruch oder Fehler. Der Grund steht in der Aktivitätszeile. |

Im Terminal ist die Leiste aus Textzeichen gezeichnet, in der Desktop-App als Grafik.

### Befehle

| Eingabe | Wirkung |
| --- | --- |
| `/agenten` | öffnet das Pane von Hand, zum Beispiel nachdem du es geschlossen hast |

### Deaktivieren

Einen Befehl zum Pausieren gibt es nicht. Das Pane kannst du jederzeit schließen, es öffnet sich beim nächsten Agenten wieder.

- Ganz abschalten: `claude plugin disable agenten-monitor`.

## Wie der Fortschritt entsteht

1. Meldet der Agent seinen Fortschritt über das Werkzeug `fortschritt` (siehe unten), ist die Leiste exakt. Die Fußzeile zeigt dann zum Beispiel `2/5 Schritte`.
2. Sonst zählt die Todo-Liste des Agenten, wenn er eine führt (`TodoWrite` oder `TaskCreate` und `TaskUpdate`). Die Fußzeile zeigt dann zum Beispiel `3/7 Aufgaben`.
3. Sonst wird geschätzt: Je mehr Tool-Aufrufe, desto voller die Leiste, höchstens bis 90 %. Die Fußzeile zeigt `geschätzt`.
4. Ist der Agent fertig, steht die Leiste auf 100 % und die Fußzeile auf `abgeschlossen`.

Damit Agenten ihren Fortschritt tatsächlich melden, hängt die Mod an den Auftrag jedes neuen Agenten einen kurzen Hinweis an. Er bittet den Agenten, `fortschritt` am Anfang mit seinem Plan und danach bei jedem Schritt aufzurufen, und Shell-Befehlen eine kurze deutsche Beschreibung mitzugeben. Fortgesetzte Agenten bekommen den Hinweis nicht noch einmal.

Die Aktivitätszeile übersetzt Tool-Aufrufe in kurze Sätze, etwa `Grep: in src nach „TODO“ suchen` oder `WebFetch: docs.example.com abrufen`. Hat ein Bash- oder PowerShell-Befehl keine Beschreibung, steht zuerst `Bash: <Programm> ausführen`. Parallel fasst Haiku den Befehl in wenigen Wörtern zusammen und ersetzt die Zeile, sobald die Antwort da ist, spätestens nach 4 Sekunden.

### Das Werkzeug `fortschritt`

Die Mod stellt jedem Agenten das Werkzeug `mcp__agenten-monitor__fortschritt` bereit:

| Parameter | Bedeutung |
| --- | --- |
| `erledigt` | wie viele Schritte schon erledigt sind, ab 0 |
| `gesamt` | wie viele Schritte es insgesamt sind, ab 1 |
| `schritt` | was der Agent gerade tut, kurz und auf Deutsch, z. B. `Tests ausführen` |

Das Werkzeug hat keine Nebenwirkungen. Ruft die Hauptsession es auf, ändert sich nichts.

## Optionen

Die Mod hat keine Optionen.

## Grenzen

- Exakt ist der Fortschritt nur, wenn der Agent ihn meldet oder eine Todo-Liste führt. Die Schätzung aus der Zahl der Tool-Aufrufe sagt wenig über den echten Stand.
- Der Hinweis an jeden neuen Agenten kostet ein paar Tokens pro Agent.
- Jeder Shell-Befehl ohne Beschreibung kostet einen kurzen Haiku-Aufruf.
- Das Werkzeug `fortschritt` steht auch in der Hauptsession im Werkzeugkatalog, obwohl es dort nichts bewirkt.
- Das Pane hält die letzten 20 Agenten der Session, ältere fallen heraus.

## Entwicklung

Im Ordner der Mod, mit Claude Code 2.1.304:

```
claude plugin validate .
claude plugin test .
```

Die Logik steht in `hooks/register.tsx`, die Typen in `types/index.d.ts`, die Tests in `tests/agenten.test.tsx`.
