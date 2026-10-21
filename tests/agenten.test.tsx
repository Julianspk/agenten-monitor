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
