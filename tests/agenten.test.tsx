import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agenten-monitor',
  component: 'Pane',
  requestId: 'agenten',
  props: {
    title: 'Agenten',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

test('Pane zeigt Modell, Fortschritt, Laufzeit und verständliche Zeilen je Agent', async ($, on) => {
  // Diese Hooks stehen für die Engine unter der Mod.
  const clock = mock.clock(on)
  mock.store(on)
  let spawnPrompt = ''
  on('command.register', () => ({ value: { command: 'agenten' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__agenten-monitor__fortschritt' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', (_, e) => {
    spawnPrompt = e.prompt

    return { model: 'claude-haiku-4-5-20251001', agentId: 'a1' }
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Kurz warten.', usage: USAGE } }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Lies die Doku', description: 'Doku lesen', subagentType: 'Explore' } as never)
  expect(spawnPrompt).toContain('mcp__agenten-monitor__fortschritt')

  // Aufrufe aus der Schleife des Subagenten, daher mit agentId.
  const loose = $ as unknown as { tool: { call: (e: unknown) => Promise<unknown> } }
  await loose.tool.call({ tool: 'Bash', agentId: 'a1', command: 'sleep 5' })
  await clock.advance(83_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Doku lesen/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Haiku 4\.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1:23/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Bash: Kurz warten$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /geschätzt/ })).toBeDefined()
    // Ohne frühere Läufe gibt es keine Restzeit.
    expect(await ui.find({ type: 'Text', text: /Dauer lernt noch/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /noch ~/ })).toBeUndefined()
    await ui.unmount()
  }

  await loose.tool.call({ tool: 'mcp__agenten-monitor__fortschritt', agentId: 'a1', erledigt: 2, gesamt: 5, schritt: 'Tests ausführen' })
  await loose.tool.call({ tool: 'Read', agentId: 'a1', file_path: 'C:\\repo\\src\\app.ts' })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /40 %/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2\/5 Schritte/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Tests ausführen/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Read: app\.ts lesen/ })).toBeDefined()
  await ui.unmount()

  await $.turn.complete({ agentId: 'a1', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(60_000)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /100 %/ })).toBeDefined()
  // Die Laufzeit bleibt nach dem Ende stehen.
  expect(await ui.find({ type: 'Text', text: /1:23/ })).toBeDefined()
  await ui.unmount()
})

test('Pane zeigt das Modell, das wirklich geantwortet hat, nicht das beim Start genannte', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'agenten' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__agenten-monitor__fortschritt' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  // Ein Router unter der Mod hat den Schritt auf Sonnet umgeleitet.
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn',
      usage: { ...USAGE, model: 'claude-sonnet-5-5' },
    } as never
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Plane', description: 'Planen', subagentType: 'dev-team:planer' } as never)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a1' })
  for await (const _ of step) { /* Stream leeren */ }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeUndefined()
  await ui.unmount()
})

test('Restzeit aus früheren Läufen desselben Typs, jeder fertige Lauf wird gelernt', async ($, on) => {
  const clock = mock.clock(on)
  // Drei frühere Explore-Läufe mit Haiku: üblich sind 2:00.
  mock.store(on, { laeufe: { Explore: [100_000, 120_000, 140_000].map(ms => ({ ms, model: 'Haiku 4.5' })) } })
  let spawned = 0
  on('command.register', () => ({ value: { command: 'agenten' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__agenten-monitor__fortschritt' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-haiku-4-5-20251001', agentId: `a${++spawned}` }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  const loose = $ as unknown as { tool: { call: (e: unknown) => Promise<unknown> } }
  const spawn = () => $.agent.spawn({ prompt: 'Such', description: 'Suchen', subagentType: 'Explore' } as never)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await spawn()
  await clock.advance(20_000)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /noch ~1:40/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Dauer aus 3 Läufen/ })).toBeDefined()
  await ui.unmount()

  // Nach 0:20 halb fertig: Das schnelle Tempo zieht die Restzeit unter die übliche.
  await loose.tool.call({ tool: 'mcp__agenten-monitor__fortschritt', agentId: 'a1', erledigt: 1, gesamt: 2, schritt: 'Prüfen' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /noch ~0:40/ })).toBeDefined()
  await ui.unmount()

  // Der Lauf endet nach 0:50 und zählt beim nächsten Agenten mit: Üblich sind jetzt 1:40 statt 2:00.
  await clock.advance(30_000)
  await $.turn.complete({ agentId: 'a1', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await spawn()
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Dauer aus 4 Läufen/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /noch ~1:40/ })).toBeDefined()
  await ui.unmount()
})
