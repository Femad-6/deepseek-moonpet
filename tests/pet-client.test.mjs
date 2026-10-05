import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
test('client renders status art without persisting, restores after interaction and handles offline', () => {
  const start = source.indexOf('  function applyPet(')
  assert.notEqual(start, -1)
  const end = source.indexOf('  // ── polling', start)
  const calls = []
  const state = { config: { petEnabled: true }, pet: null, sprite: null }
  const root = { dataset: {} }
  const petLabel = { hidden: true, textContent: '' }
  const context = vm.createContext({ state, root, petLabel, cfg: () => state.config, setSprite: (sprite) => { calls.push(sprite); state.sprite = sprite } })
  vm.runInContext(source.slice(start, end), context)
  const sprite = { file: 'think.png', url: '/think.png', crop: { x: 0, y: 0, w: 1, h: 1 }, size: { w: 100, h: 100 } }
  context.applyPet({ enabled: true, status: 'thinking', sprite, activeCount: 1 })
  assert.equal(root.dataset.petStatus, 'thinking')
  assert.equal(petLabel.textContent, '正在思考')
  assert.equal(calls[0].persist, false)
  context.applyPet({ enabled: true, status: 'thinking', sprite, activeCount: 1 })
  assert.equal(calls.length, 1)
  state.sprite = { file: 'click.png', url: '/click.png' }
  context.applyPet(state.pet)
  assert.equal(calls.length, 2)
  context.applyPet({ ...state.pet, status: 'offline', sprite: null })
  assert.equal(petLabel.textContent, '连接中断')
  state.config.petEnabled = false
  context.applyPet(state.pet)
  assert.equal(petLabel.hidden, true)
  assert.equal(root.dataset.petStatus, '')
})
