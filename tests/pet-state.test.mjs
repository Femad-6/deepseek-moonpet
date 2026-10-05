import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPetState } from '../lib/pet-state.js'

const event = (type, data = {}) => ({ type, data })
const setup = () => { let now = 1000; return { pet: createPetState({ now: () => now, holdMs: 6000 }), advance: (ms) => { now += ms } } }

test('real turn and tool events drive thinking, working and completion', () => {
  const { pet, advance } = setup()
  assert.equal(pet.snapshot().status, 'idle')
  pet.handle('a', event('turn/start', { turn: 1 }))
  assert.equal(pet.snapshot().status, 'thinking')
  pet.handle('a', event('tool/call', { turn: 1, callId: 'x' }))
  assert.equal(pet.snapshot().status, 'working')
  pet.handle('a', event('tool/result', { turn: 1, message: { toolCallId: 'x', content: [] } }))
  assert.equal(pet.snapshot().status, 'thinking')
  pet.handle('a', event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  assert.equal(pet.snapshot().status, 'done')
  advance(6001)
  assert.equal(pet.snapshot().status, 'idle')
})

test('all outstanding approvals must settle before waiting ends', () => {
  const { pet } = setup()
  pet.handle('a', event('turn/start', { turn: 1 }))
  pet.handle('a', event('tool/call', { turn: 1, callId: 'x' }))
  pet.handle('a', event('approval/asked', { id: 'p' }))
  pet.handle('a', event('approval/asked', { id: 'q' }))
  pet.handle('a', event('approval/decided', { id: 'p', outcome: 'allowed-once' }))
  assert.equal(pet.snapshot().status, 'waiting')
  pet.handle('a', event('approval/decided', { id: 'q', outcome: 'rejected' }))
  assert.equal(pet.snapshot().status, 'working')
})

test('concurrent sessions do not show completion while another is running', () => {
  const { pet } = setup()
  pet.handle('a', event('turn/start', { turn: 1 }))
  pet.handle('b', event('turn/start', { turn: 8 }))
  pet.handle('a', event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  assert.equal(pet.snapshot().status, 'thinking')
  assert.equal(pet.snapshot().activeCount, 1)
  pet.handle('b', event('approval/asked', { id: 'p' }))
  assert.equal(pet.snapshot().status, 'waiting')
  pet.dispose('b')
  assert.equal(pet.snapshot().status, 'idle')
})

test('failure and cancellation are distinct from successful completion', () => {
  const { pet } = setup()
  for (const [kind, expected] of [['error', 'error'], ['aborted', 'stopped'], ['blocked', 'stopped'], ['forked', 'stopped']]) {
    pet.handle('a', event('turn/start', { turn: 1 }))
    pet.handle('a', event('turn/end', { turn: 1, reason: { kind } }))
    assert.equal(pet.snapshot().status, expected)
  }
})

test('late old turn events and malformed events cannot override new work', () => {
  const { pet } = setup()
  pet.handle('a', null)
  pet.handle('a', event('approval/asked', { id: 'no-open-turn' }))
  assert.equal(pet.snapshot().status, 'idle')
  pet.handle('a', event('turn/start', { turn: 2 }))
  pet.handle('a', event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  assert.equal(pet.snapshot().status, 'thinking')
})

test('partial parallel tool results leave remaining tools working', () => {
  const { pet } = setup()
  pet.handle('a', event('turn/start', { turn: 1 }))
  pet.handle('a', event('tool/call', { turn: 1, callId: 'x' }))
  pet.handle('a', event('tool/call', { turn: 1, callId: 'y' }))
  pet.handle('a', event('tool/result', { turn: 1, message: { toolCallId: 'x', content: [] } }))
  assert.equal(pet.snapshot().status, 'working')
  pet.handle('a', event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  assert.equal(pet.snapshot().status, 'done')
})
