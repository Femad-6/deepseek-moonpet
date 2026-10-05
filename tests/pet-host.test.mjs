import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

const home = path.resolve('work', `pet-host-test-${Date.now()}`)
process.env.DSH_HOME = home
const pack = path.join(home, 'dsh-moonpet/packs/test')
fs.mkdirSync(path.join(pack, 'sprites'), { recursive: true })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
for (const file of ['idle.png', 'think.png', 'done.png']) fs.writeFileSync(path.join(pack, 'sprites', file), png)
fs.writeFileSync(path.join(pack, 'pack.json'), JSON.stringify({ id: 'test', defaultSprite: 'idle.png' }))
fs.writeFileSync(path.join(pack, 'pet.json'), JSON.stringify({ sprites: { idle: 'idle.png', thinking: 'think.png', done: 'done.png', waiting: '../../outside.png' } }))
fs.writeFileSync(path.join(home, '.dsh-moonpet.json'), JSON.stringify({ spritePack: 'test', petEnabled: true }))
const { apply } = await import('../lib/index.js')
const routes = new Map(), listeners = new Map()
apply({ webServer: { register(r) { routes.set(r.path, r.handler); return () => {} }, tapIndex() { return () => {} } }, credentials: { async resolve() { return null } }, on(name, fn) { listeners.set(name, fn); return () => {} }, effect(fn) { fn() } })
const send = (type, data, id = 'a') => listeners.get('session/event')({ id }, { type, data })
async function read(route = '/dsh-moonpet/api/turn', method = 'GET', body = '') {
  return new Promise((resolve, reject) => {
    const req = new Readable({ read() {} }); req.url = route; req.method = method; req.headers = {}
    const res = { writeHead(code) { this.code = code }, end(data) { resolve(JSON.parse(String(data))) } }
    Promise.resolve(routes.get(route)(req, res)).catch(reject)
    req.push(body || null); if (body) req.push(null)
  })
}
test('Host exposes event-driven art, safe fallback, completion without token usage and opt-out', async () => {
  let result = await read()
  assert.equal(result.pet.status, 'idle')
  assert.equal(result.pet.sprite.file, 'idle.png')
  send('turn/start', { turn: 1 })
  result = await read()
  assert.equal(result.pet.status, 'thinking')
  assert.equal(result.pet.sprite.file, 'think.png')
  send('tool/call', { turn: 1, step: 1, callId: 'x', name: 'read_file', arguments: '{}' })
  assert.equal((await read()).pet.status, 'working')
  send('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'x', content: [] } })
  assert.equal((await read()).pet.status, 'thinking')
  send('approval/asked', { id: 'p' })
  result = await read()
  assert.equal(result.pet.status, 'waiting')
  assert.equal(result.pet.sprite.file, 'idle.png')
  send('approval/decided', { id: 'p', outcome: 'allowed-once' })
  send('turn/end', { turn: 1, reason: { kind: 'completed' } })
  result = await read()
  assert.equal(result.seq, 0)
  assert.equal(result.pet.status, 'done')
  assert.equal(result.pet.sprite.file, 'done.png')
  assert.equal(result.pet.sprite.url.includes('pack=test'), true)
  const boot = await read('/dsh-moonpet/api/bootstrap')
  assert.equal(boot.pet.status, 'done')
  await read('/dsh-moonpet/api/config', 'PUT', '{"petEnabled":false}')
  result = await read()
  assert.equal(result.pet.enabled, false)
})

test('focus API persists settings, starts pauses resumes and rejects unsafe sound IDs', async () => {
  let response=await read('/dsh-moonpet/api/focus')
  assert.equal(response.focus.status,'idle')
  response=await read('/dsh-moonpet/api/focus','POST',JSON.stringify({action:'start',settings:{workMinutes:2,breakMinutes:1,sound:'chime'}}))
  assert.equal(response.focus.status,'running')
  assert.equal(response.focus.settings.sound,'chime')
  response=await read('/dsh-moonpet/api/focus','POST','{"action":"pause"}')
  assert.equal(response.focus.status,'paused')
  response=await read('/dsh-moonpet/api/focus','POST','{"action":"resume"}')
  assert.equal(response.focus.status,'running')
  response=await read('/dsh-moonpet/api/focus','POST','{"action":"stop"}')
  assert.equal(response.focus.status,'idle')
  response=await read('/dsh-moonpet/api/focus','POST','{"action":"preview","sound":"../../file"}')
  assert.equal(response.ok,false)
  assert.ok(fs.existsSync(path.join(home,'.dsh-moonpet-focus.json')))
})
