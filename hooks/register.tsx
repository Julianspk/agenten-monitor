import { atom, read, update } from 'claude-code'
import type { Register, ToolCallInput } from 'claude-code'

import type { AgentRow } from '../types'

const PANE = 'agenten'
const TITLE = 'Agenten'
const FORTSCHRITT = 'mcp__agenten-monitor__fortschritt'
const agents = atom({ plugin: 'agenten-monitor', key: 'agents' } as const, [])

// Wird an den Auftrag jedes neuen Subagenten angehängt.
const HINT = `

Hinweis des Agenten-Monitors: Falls das Werkzeug ${FORTSCHRITT} verfügbar ist, melde damit deinen Fortschritt: einmal am Anfang mit deinem Plan (erledigt 0, gesamt = Zahl deiner geplanten Schritte) und danach bei jedem neuen Schritt. Beschreibe den Schritt kurz und verständlich auf Deutsch, z. B. "Tests ausführen". Gib bei Bash- und PowerShell-Befehlen immer eine kurze description auf Deutsch an, z. B. "Vier Sekunden warten".`

// Je Status: Symbol, Theme-Farbe (Text, Rahmen) und Hex-Farbe (SVG-Leiste).
const LOOK = {
  running: { glyph: '●', color: 'claude', hex: '#D97757', word: 'läuft' },
  done: { glyph: '✓', color: 'success', hex: '#3FA66B', word: 'fertig' },
  failed: { glyph: '✕', color: 'error', hex: '#E5484D', word: 'abgebrochen' },
} as const

// Liefert eine Änderung der Liste, die nur die Zeile des Agenten `id` umschreibt.
function patch(id: string, fn: (row: AgentRow) => AgentRow) {
  return (list: AgentRow[]) => list.map(row => (row.id === id ? fn(row) : row))
}

// Lesbarer Modellname, z. B. "claude-haiku-4-5-20251001" -> "Haiku 4.5".
function modelName(id: string): string {
  const match = /(opus|sonnet|haiku|fable)(?:-(\d{1,2})(?:-(\d{1,2}))?(?=$|[-[@]))?/i.exec(id)
  if (match === null) return id
  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1).toLowerCase()

  return [family, [match[2], match[3]].filter(Boolean).join('.')].filter(Boolean).join(' ')
}

// Verständliche Zusammenfassung eines Tool-Aufrufs, immer als "Werkzeug: Text".
function summarize(e: ToolCallInput): string {
  const args = e as unknown as Record<string, unknown>
  const str = (key: string) => {
    const value = args[key]

    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  }
  const file = (key: string) => str(key)?.split(/[\\/]/).filter(Boolean).pop() ?? 'Datei'
  const tool = String(e.tool)
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return `${tool}: ${str('description') ?? `${str('command')?.split(/\s+/)[0] ?? 'Befehl'} ausführen`}`
    case 'Read':
      return `Read: ${file('file_path')} lesen`
    case 'Edit':
      return `Edit: ${file('file_path')} bearbeiten`
    case 'Write':
      return `Write: ${file('file_path')} schreiben`
    case 'NotebookEdit':
      return `NotebookEdit: ${file('notebook_path')} bearbeiten`
    case 'Grep':
      return `Grep: ${str('path') === undefined ? '' : `in ${file('path')} `}nach „${str('pattern') ?? ''}“ suchen`
    case 'Glob':
      return `Glob: Dateien ${str('pattern') ?? ''} suchen`
    case 'WebFetch': {
      const url = str('url') ?? ''
      try {
        return `WebFetch: ${new URL(url).host} abrufen`
      } catch {
        return `WebFetch: ${url || 'Seite'} abrufen`
      }
    }
    case 'WebSearch':
      return `WebSearch: im Web nach „${str('query') ?? ''}“ suchen`
    case 'Agent':
      return `Agent: „${str('description') ?? 'Unteragent'}“ starten`
    case 'ToolSearch':
      return 'ToolSearch: Werkzeuge laden'
    case 'Skill':
      return `Skill: ${str('skill') ?? 'Skill'} laden`
    case 'TodoWrite':
      return 'TodoWrite: Aufgabenliste aktualisieren'
    case 'TaskCreate':
      return `TaskCreate: Aufgabe „${str('subject') ?? ''}“ anlegen`
    case 'TaskUpdate':
      return 'TaskUpdate: Aufgabe aktualisieren'
  }
  const name = tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool

  return `${name}: ${str('description') ?? 'wird ausgeführt'}`
}

// Fortschritt: gemeldet über das Werkzeug, sonst aus der Todo-Liste, sonst geschätzt.
function progress(row: AgentRow): { ratio: number; label: string } {
  if (row.status === 'done') return { ratio: 1, label: 'abgeschlossen' }
  if (row.goal !== undefined) return { ratio: row.goal.done / row.goal.total, label: `${row.goal.done}/${row.goal.total} Schritte` }
  const total = row.todos.length
  if (total > 0) {
    const done = row.todos.filter(todo => todo.isDone).length

    return { ratio: done / total, label: `${done}/${total} Aufgaben` }
  }

  // ponytail: Schätzung aus der Zahl der Tool-Aufrufe (max. 90 %), genau nur mit gemeldetem Fortschritt
  return { ratio: Math.min(0.9, row.steps / (row.steps + 10)), label: 'geschätzt' }
}

// Laufzeit als m:ss bzw. h:mm:ss.
function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mmss = `${Math.floor(s / 60) % 60}:${String(s % 60).padStart(2, '0')}`

  return s >= 3600 ? `${Math.floor(s / 3600)}:${mmss.padStart(5, '0')}` : mmss
}

// Leiste als SVG-Pille mit Verlauf, für Oberflächen mit Svg.
function svgBar(ratio: number, hex: string, width: number): string {
  const h = 6
  const fill = ratio > 0 ? Math.max(h, ratio * width) : 0

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">`
    + `<defs><linearGradient id="g"><stop offset="0" stop-color="${hex}" stop-opacity="0.65"/><stop offset="1" stop-color="${hex}"/></linearGradient></defs>`
    + `<rect width="${width}" height="${h}" rx="${h / 2}" fill="rgba(128,128,128,0.22)"/>`
    + `<rect width="${fill}" height="${h}" rx="${h / 2}" fill="url(#g)"/></svg>`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agenten',
      description: 'Zeigt Fortschritt und aktuelle Aufgabe der Agenten dieser Session',
    })
    await $.tool.register({
      name: 'fortschritt',
      description: 'Meldet dem Agenten-Monitor deinen Fortschritt, damit der Mensch ihn als Fortschrittsleiste sieht. '
        + 'Nur in Subagenten verwenden. Am Anfang mit erledigt 0 und gesamt = Zahl der geplanten Schritte aufrufen, '
        + 'danach bei jedem neuen Schritt. Ohne Nebenwirkungen.',
      inputSchema: {
        type: 'object',
        properties: {
          erledigt: { type: 'integer', minimum: 0, description: 'Wie viele Schritte schon erledigt sind' },
          gesamt: { type: 'integer', minimum: 1, description: 'Wie viele Schritte es insgesamt sind' },
          schritt: { type: 'string', description: 'Was du gerade tust, kurz und verständlich auf Deutsch, z. B. "Tests ausführen"' },
        },
        required: ['erledigt', 'gesamt', 'schritt'],
      },
      isDeferred: false,
    })
    // Laufzeiten jede Sekunde neu zeichnen, solange ein Agent läuft.
    $.clock.every(1000, () => {
      void read($, agents).then(list => {
        if (list.some(row => row.status === 'running')) $.ui.invalidate('ui.render')
      })
    })

    return next(e)
  })

  on('command.run', { command: 'agenten' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Agenten-Pane geöffnet.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e.resume === undefined ? { ...e, prompt: e.prompt + HINT } : e)
    if (spawned.agentId !== undefined) {
      const row: AgentRow = {
        id: spawned.agentId,
        description: e.description,
        type: e.subagentType,
        model: spawned.model,
        status: 'running',
        activity: 'startet',
        steps: 0,
        todos: [],
        startedAt: await $.clock.now(),
      }
      await update($, agents, list => [...list.filter(one => one.id !== row.id), row].slice(-20))
      void $.ui.open({ id: PANE, title: TITLE })
    }

    return spawned
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await update($, agents, patch(e.agentId, row => ({ ...row, status: 'running', endedAt: undefined })))
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const isDone = e.reason === 'answer'
    if (e.agentId !== undefined) {
      const endedAt = await $.clock.now()
      await update($, agents, patch(e.agentId, row => ({
        ...row,
        status: isDone ? 'done' : 'failed',
        activity: isDone ? 'Ergebnis übergeben' : `Beendet: ${e.reason}`,
        endedAt,
      })))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    const args = e as unknown as Record<string, unknown>
    // Das Werkzeug, mit dem Subagenten ihren Fortschritt melden.
    if (String(e.tool) === FORTSCHRITT) {
      if (id === undefined) return { result: 'Nur Subagenten melden Fortschritt; nichts geändert.' }
      const total = Math.max(1, Math.round(Number(args.gesamt) || 1))
      const done = Math.min(total, Math.max(0, Math.round(Number(args.erledigt) || 0)))
      const task = typeof args.schritt === 'string' ? args.schritt.trim().slice(0, 200) : ''
      await update($, agents, patch(id, row => ({ ...row, goal: { done, total }, task: task || row.task })))

      return { result: `Fortschritt gemeldet: ${done}/${total}.` }
    }
    if (id === undefined) return next(e)

    const summary = summarize(e)
    await update($, agents, patch(id, row => ({ ...row, steps: row.steps + 1, activity: summary })))
    if (e.tool === 'TodoWrite') {
      const todos = e.todos.map((todo, i) => ({ id: String(i), label: todo.activeForm, isDone: todo.status === 'completed' }))
      const current = e.todos.find(todo => todo.status === 'in_progress')
      await update($, agents, patch(id, row => ({ ...row, todos, task: current?.activeForm ?? row.task })))
    }

    // Shell-Befehl ohne description: kurze Zusammenfassung vom Modell holen, während der Befehl läuft.
    const isShell = e.tool === 'Bash' || String(e.tool) === 'PowerShell'
    const explained = isShell && (typeof args.description !== 'string' || args.description.trim() === '')
      ? $.model.complete({
        model: 'haiku',
        system: 'Du beschreibst Shell-Befehle für eine Statusanzeige. Antworte nur mit einer kurzen deutschen Phrase im Infinitiv, höchstens sechs Wörter, ohne Satzzeichen am Ende. Beispiel: Tests ausführen',
        prompt: String(args.command ?? '').slice(0, 2000),
        maxTokens: 40,
        timeoutMs: 4000,
      }).then(answer => {
        const text = answer.isAnswered ? answer.text.split('\n')[0]!.replace(/["„“.]/g, '').trim().slice(0, 80) : ''
        if (text === '') return undefined

        return update($, agents, patch(id, row => (row.activity === summary ? { ...row, activity: `${String(e.tool)}: ${text}` } : row)))
      }).catch(() => undefined)
      : undefined

    const ran = await next(e)
    await explained
    if (e.tool === 'TaskCreate') {
      const created = (ran.result as { task?: { id: string } } | undefined)?.task
      const label = e.activeForm ?? e.subject
      if (created !== undefined) {
        await update($, agents, patch(id, row => ({ ...row, todos: [...row.todos, { id: created.id, label, isDone: false }] })))
      }
    }
    if (e.tool === 'TaskUpdate') {
      const { taskId, status } = e
      await update($, agents, patch(id, row => {
        const todo = row.todos.find(one => one.id === taskId)
        const todos = status === 'deleted'
          ? row.todos.filter(one => one.id !== taskId)
          : row.todos.map(one => (one.id === taskId && status !== undefined ? { ...one, isDone: status === 'completed' } : one))

        return {
          ...row,
          todos,
          task: status === 'in_progress' ? (e.activeForm ?? e.subject ?? todo?.label ?? row.task) : row.task,
        }
      }))
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const Svg = e.surface === 'terminal' ? undefined : $.ui.resolve(e).Svg
    const now = await $.clock.now()
    const list = await read($, agents)
    // Laufende zuerst, dann die neuesten.
    const sorted = [...list].sort((a, b) =>
      Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt - a.startedAt)
    const count = (status: AgentRow['status']) => list.filter(row => row.status === status).length
    const inner = Math.max(12, e.props.bodyColumns - 4)

    if (list.length === 0) {
      return (
        <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
          <Text weight="semibold">Noch keine Agenten</Text>
          <Text dimColor size="footnote">
            Sobald in dieser Session ein Agent startet, erscheinen hier sein Fortschritt und seine aktuelle Aufgabe.
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={2} paddingX={1}>
          {(['running', 'done', 'failed'] as const).filter(status => count(status) > 0).map(status => (
            <Text size="footnote">
              <Text color={LOOK[status].color}>{LOOK[status].glyph}</Text>
              <Text dimColor> {count(status)} {LOOK[status].word}</Text>
            </Text>
          ))}
        </Box>
        {sorted.map(row => {
          const look = LOOK[row.status]
          const isRunning = row.status === 'running'
          const { ratio, label } = progress(row)
          const pct = `${Math.round(ratio * 100)} %`
          const barWidth = Math.max(8, inner - pct.length - 1)
          const full = Math.floor(ratio * barWidth)
          const half = ratio * barWidth - full >= 0.5 ? '╸' : ''
          const cut = row.activity.indexOf(': ')
          const tool = cut < 0 ? '' : row.activity.slice(0, cut)
          const what = cut < 0 ? row.activity : row.activity.slice(cut + 2)
          const meta = [row.type, label, `${row.steps} Tool-Aufrufe`].join('  ·  ')

          return (
            <Box
              key={row.id}
              flexDirection="column"
              borderStyle="round"
              borderColor={isRunning ? look.color : 'subtle'}
              borderDimColor={!isRunning}
              paddingX={1}
            >
              <Box flexDirection="row" justifyContent="space-between" gap={1}>
                <Text weight="semibold" wrap="truncate-end">
                  <Text color={look.color}>{look.glyph}</Text> {row.description}
                </Text>
                <Text dimColor tabular>{elapsed((row.endedAt ?? now) - row.startedAt)}</Text>
              </Box>
              <Box flexDirection="row" alignItems="center" gap={1}>
                {Svg !== undefined
                  ? (
                    <Box flexGrow={1} flexShrink={1}>
                      <Svg source={svgBar(ratio, look.hex, 320)} alt={`Fortschritt ${pct}`} />
                    </Box>
                  )
                  : (
                    <Text>
                      <Text color={look.color}>{'━'.repeat(full)}{half}</Text>
                      <Text color="subtle">{'━'.repeat(Math.max(0, barWidth - full - half.length))}</Text>
                    </Text>
                  )}
                <Text tabular weight="medium" color={isRunning ? undefined : look.color}>{pct}</Text>
              </Box>
              {row.task !== undefined && (
                <Text weight="medium" dimColor={!isRunning} wrap="truncate-end">
                  <Text color={look.color}>›</Text> {row.task}
                </Text>
              )}
              <Text dimColor={!isRunning || row.task !== undefined} wrap="truncate-end">
                {row.task === undefined && <Text color={look.color}>› </Text>}
                {tool !== '' && <Text weight="medium">{tool}: </Text>}
                {what}
              </Text>
              <Text size="caption" wrap="truncate-end">
                <Text weight="medium" color={look.color}>{modelName(row.model)}</Text>
                <Text dimColor>{'  ·  '}{meta}</Text>
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
