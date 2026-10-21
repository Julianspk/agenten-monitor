# agenten-monitor

Eine Mod für Claude Code, die in einem Pane zeigt, woran die Agenten einer Session gerade arbeiten.

Je Agent eine Karte mit:

- Aufgabe, Status (läuft, fertig, abgebrochen) und Laufzeit
- Fortschrittsleiste: exakt, wenn der Agent seinen Fortschritt über das Werkzeug `fortschritt` meldet oder eine Todo-Liste führt, sonst geschätzt
- dem aktuellen Schritt und dem letzten Tool-Aufruf als verständliche Zeile, z. B. `Bash: Tests ausführen` oder `Read: app.ts lesen`
- Modell (z. B. Haiku 4.5), Agententyp und Zahl der Tool-Aufrufe

Das Pane öffnet sich, sobald ein Agent startet; `/agenten` öffnet es von Hand. Die Mod hängt an den Auftrag jedes neuen Agenten einen kurzen Hinweis an, damit er seinen Fortschritt meldet.

## Installation

In einer Terminal-Session am Prompt:

```
/plugin install agenten-monitor --marketplace Julianspk/agenten-monitor
```

Die Frage `Add marketplace?` mit `y` bestätigen, dann den Scope wählen (Enter nimmt den User-Scope).

Aus einer Shell:

```bash
claude plugin install agenten-monitor --marketplace Julianspk/agenten-monitor
```

In der Desktop-App, wo `/plugin` nicht läuft: auf + neben dem Prompt-Feld klicken, dann Plugins, Add marketplace mit `Julianspk/agenten-monitor`, dann Add plugin.

Das Repository ist privat: Die Installation klappt nur mit Lesezugriff auf GitHub und einer Git-Anmeldung für github.com auf dem eigenen Rechner (ein SSH-Schlüssel, oder `gh auth login` und danach `gh auth setup-git`).

## Voraussetzung

Eine Claude-Code-Version mit Mod-API; getestet mit 2.1.304.
