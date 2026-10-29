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
let credentialReads = 0
apply({ webServer: { register(r) { routes.set(r.path, r.handler); return () => {} }, tapIndex() { return () => {} } }, credentials: { async resolve() { credentialReads++; return null } }, on(name, fn) { listeners.set(name, fn); return () => {} }, effect(fn) { fn() } })
const send = (type, data, id = 'a') => listeners.get('session/event')({ id }, { type, data })
async function read(route = '/dsh-moonpet/api/turn', method = 'GET', body = '') {
  return new Promise((resolve, reject) => {
    const req = new Readable({ read() {} }); req.url = route; req.method = method; req.headers = {}
    const res = { writeHead(code) { this.code = code }, end(data) { resolve(JSON.parse(String(data))) } }
    Promise.resolve(routes.get(route.split('?')[0])(req, res)).catch(reject)
    req.push(body || null); if (body) req.push(null)
  })
}

test('failed config replacement is reported without applying or damaging the saved config', async () => {
  const before = (await read('/dsh-moonpet/api/config')).config
  const file = path.join(home, '.dsh-moonpet.json')
  const saved = fs.readFileSync(file, 'utf8')
  const rename = fs.renameSync
  try {
    fs.renameSync = (from, to) => {
      if (String(to).endsWith('.dsh-moonpet.json')) throw new Error('disk full')
      return rename(from, to)
    }
    const reply = await read('/dsh-moonpet/api/config', 'PUT', JSON.stringify({volume:0.12}))
    assert.equal(reply.ok, false)
    assert.match(reply.error, /保存失败/)
    assert.equal((await read('/dsh-moonpet/api/config')).config.volume, before.volume)
    assert.equal(fs.readFileSync(file, 'utf8'), saved)
  } finally { fs.renameSync = rename }
})

test('bootstrap and polling keep own account balance queries alongside the token ledger', async () => {
  const before = credentialReads
  for (const route of ['/dsh-moonpet/api/bootstrap?wallet=ofm', '/dsh-moonpet/api/state?wallet=ofm']) {
    const data = await read(route)
    assert.equal(data.ok, true)
    assert.equal(data.balance.ok, true)
    assert.equal(data.balance.totalBalance, 0)
    assert.equal(data.balance.source, 'custom')
    assert.ok(data.today)
    assert.ok(data.ledger)
  }
  assert.ok(credentialReads > before)
})
test('Host exposes event-driven art, safe fallback, completion without token usage and opt-out', async () => {
  let result = await read()
  assert.equal(result.pet.status, 'idle')
  assert.equal(result.pet.sprite.file, 'idle.png')
  assert.equal(result.pet.interactionSprite.file, 'done.png')
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

test('focus audio reads and persists the shared MoonPet volume including mute',async()=>{
 for(const volume of [0.02,0,1]){
  await read('/dsh-moonpet/api/config','PUT',JSON.stringify({volume}))
  const response=await read('/dsh-moonpet/api/focus')
  assert.equal(response.focus.audio.volume,volume)
  assert.equal(JSON.parse(fs.readFileSync(path.join(home,'.dsh-moonpet.json'),'utf8')).volume,volume)
 }
})

for (const character of ['whale', 'sakura', 'stella', 'yuzu']) test(`selecting ${character} switches session events to its independent expressions`, async () => {
  await read('/dsh-moonpet/api/config', 'PUT', JSON.stringify({spritePack:character,petEnabled:true}))
  const boot = await read('/dsh-moonpet/api/bootstrap')
  assert.equal(boot.config.spritePack, character)
  for (const [type, data, status] of [
    ['turn/start', {turn:2}, 'thinking'],
    ['tool/call', {turn:2,callId:'whale-tool',name:'read_file',arguments:'{}'}, 'working'],
    ['approval/asked', {id:'whale-approval'}, 'waiting'],
    ['approval/decided', {id:'whale-approval',outcome:'allowed-once'}, 'working'],
    ['tool/result', {turn:2,message:{toolCallId:'whale-tool',role:'tool',content:[]}}, 'thinking'],
    ['turn/end', {turn:2,reason:{kind:'completed'}}, 'done'],
    ['turn/start', {turn:3}, 'thinking'],
    ['turn/end', {turn:3,reason:{kind:'error'}}, 'error'],
    ['turn/start', {turn:4}, 'thinking'],
    ['turn/end', {turn:4,reason:{kind:'aborted'}}, 'stopped'],
  ]) {
    send(type, data, `${character}-session`)
    const result = await read()
    assert.equal(result.pet.status, status)
    assert.equal(result.pet.sprite.file, `${status}.png`)
    assert.ok(result.pet.sprite.url.includes(`pack=${character}`))
  }
})

test('createUsageService reads signed-in DeepSeek account balance when DEEPSEEK_API_KEY is absent', async () => {
  const { createUsageService } = await import('../lib/usage.js')
  const usage = createUsageService({
    credentials: { async resolve() { return null } },
    deepseekAccount: {
      async getBalance() {
        return {
          status: 'ready',
          value: [{ currency: 'CNY', balance: '23.66' }],
          bonusWallets: [{ currency: 'CNY', balance: '1.34' }],
        }
      },
    },
    usageFiles: [path.join(home, 'account-usage.json')],
  })
  const bal = await usage.getBalance()
  assert.equal(bal.ok, true)
  assert.equal(bal.source, 'account')
  assert.equal(bal.currency, 'CNY')
  assert.equal(bal.totalBalance, 25)
})


test('brand portrait is served as a self-contained SVG asset', async () => {
  const handler = routes.get('/dsh-moonpet/asset/ui/brand.svg')
  assert.equal(typeof handler, 'function')
  let code, headers, bytes
  await handler({}, { writeHead(c, h) { code = c; headers = h }, end(data) { bytes = String(data) } })
  assert.equal(code, 200)
  assert.match(JSON.stringify(headers), /image\/svg\+xml/)
  assert.match(bytes, /data:image\/webp;base64,/)
  assert.ok(Buffer.byteLength(bytes) <= 256 * 1024, 'portrait stays within the host icon limit')
  assert.doesNotMatch(bytes, /href="https?:/)
})
