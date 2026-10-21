export type AgentTodo = { id: string; label: string; isDone: boolean }

export type AgentRow = {
  id: string
  description: string
  type: string
  model: string
  status: 'running' | 'done' | 'failed'
  activity: string
  task?: string
  goal?: { done: number; total: number }
  steps: number
  todos: AgentTodo[]
  startedAt: number
  endedAt?: number
  // Fortgesetzter Agent: Seine Laufzeit sagt nichts über einen neuen Lauf, sie wird nicht gelernt.
  isResumed?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agenten-monitor': { agents: AgentRow[] }
  }
}
