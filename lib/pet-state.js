/** Observes committed Harness events. No model calls, timers, or approval actions. */
export function createPetState({ now = Date.now, holdMs = 6000 } = {}) {
  const active = new Map()
  let terminal = null
  function handle(id, event) {
    if (!id || !event || !event.data || typeof event.data !== 'object') return
    const { type, data } = event
    if (type === 'turn/start') {
      if (!Number.isFinite(data.turn)) return
      const previous = active.get(id)
      if (previous && previous.turn >= data.turn) return
      active.set(id, { turn: data.turn, tools: new Set(), approvals: new Set() })
      terminal = null
      return
    }
    const row = active.get(id)
    if (!row || (data.turn !== undefined && data.turn !== row.turn)) return
    if (type === 'tool/call' && data.callId) row.tools.add(data.callId)
    if (type === 'tool/result') {
      const callId = data.message && data.message.toolCallId || data.callId
      if (callId) row.tools.delete(callId)
    }
    if (type === 'approval/asked' && data.id) row.approvals.add(data.id)
    if (type === 'approval/decided' && data.id) row.approvals.delete(data.id)
    if (type === 'turn/end') {
      active.delete(id)
      const kind = data.reason && data.reason.kind
      const status = kind === 'completed' ? 'done' : kind === 'error' ? 'error' : 'stopped'
      terminal = active.size === 0 ? { status, until: now() + holdMs } : null
    }
  }
  function snapshot() {
    let status = 'idle'
    if ([...active.values()].some((r) => r.approvals.size)) status = 'waiting'
    else if ([...active.values()].some((r) => r.tools.size)) status = 'working'
    else if (active.size) status = 'thinking'
    else if (terminal && now() < terminal.until) status = terminal.status
    return { status, activeCount: active.size }
  }
  return { handle, snapshot, dispose(id) { active.delete(id); terminal = null } }
}
