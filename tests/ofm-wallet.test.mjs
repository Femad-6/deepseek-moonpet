import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
function harness(fetch) {
  const start = source.indexOf('  // ── Our Free Model wallet')
  assert.notEqual(start, -1, 'OFM wallet adapter exists')
  const end = source.indexOf('  // ── server io', start)
  const state = { ofm: null }
  const context = vm.createContext({ state, fetch, AbortSignal, renderWallet() {}, formatTokenCount: String })
  vm.runInContext(source.slice(start, end), context)
  return { context, state }
}
const response = data => ({ ok: true, status: 200, json: async () => data })

test('queries only configured channels using the authenticated RPC envelope, keeps units separate', async () => {
  const calls = []
  const { context, state } = harness(async (url, options) => {
    if (url.endsWith('/summary')) return response({ version: '2.5.4', channels: { state: 'ready' } })
    const body = JSON.parse(options.body)
    assert.equal(body.type, 'client-request')
    assert.equal(body.method, 'channel-pack')
    assert.equal(options.credentials, 'same-origin')
    assert.ok(body.rpcId)
    const { method, payload } = body.payload
    calls.push([method, payload])
    const value = method === 'provider.status'
      ? { statuses: { buddy: { accounts: { total: 2 } }, cline: { accounts: { total: 1 } }, gemini: { accounts: { total: 1 } } } }
      : { accounts: payload.provider === 'gemini'
        ? [{ balance: { total: 60, packages: [{ name: '5小时', remaining: 40 }, { name: '每周', remaining: 80 }] } }]
        : [{ balance: { total: payload.provider === 'buddy' ? 0 : 2.5 } }, ...(payload.provider === 'buddy' ? [{ balance: null, error: 'offline' }] : [])] }
    return response({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value } })
  })
  await context.detectOfm()
  await context.refreshOfmWallet()
  assert.equal(state.ofm.rows.length, 3)
  assert.match(context.ofmWalletText(), /CodeBuddy 0 积分.*部分未提供/)
  assert.match(context.ofmWalletText(), /Cline \$2.50/)
  assert.match(context.ofmWalletText(), /5小时 40%.*每周 80%/)
  assert.equal(calls.filter(([method]) => method === 'credits.balances').length, 3)
  assert.ok(calls.every(([, payload]) => !payload.force))
})

test('anonymous channel has no fabricated balance; absent plugin falls back; auth failure stays explicit', async () => {
  const { context, state } = harness(async (url, options) => {
    if (url.endsWith('/summary')) return response({ version: '2', channels: { state: 'ready' } })
    const body = JSON.parse(options.body)
    return response({ rpcId: body.rpcId, type: 'server-response', result: { ok: true, value: { statuses: {} } } })
  })
  await context.detectOfm()
  await context.refreshOfmWallet()
  assert.match(context.ofmWalletText(), /未提供额度/)
  context.fetch = async () => ({ ok: false, status: 401 })
  await context.detectOfm()
  assert.match(context.ofmWalletText(), /401/)
  context.fetch = async () => ({ ok: false, status: 404 })
  await context.detectOfm()
  assert.equal(state.ofm, null)
})

test('failed refresh retains previous quota as stale and concurrent polling is coalesced', async () => {
  let release
  let calls = 0
  const { context, state } = harness(async () => { calls++; await new Promise(resolve => { release = resolve }); throw new Error('offline') })
  state.ofm = { rows: [{ id: 'buddy', name: 'CodeBuddy', text: '10 积分' }], packState: 'ready', error: '' }
  const first = context.refreshOfmWallet()
  await context.refreshOfmWallet()
  assert.equal(calls, 1)
  release()
  await first
  assert.match(context.ofmWalletText(), /10 积分/)
  assert.match(context.ofmWalletText(), /缓存/)
})

test('own account balance remains primary alongside escaped OFM quota and token total', () => {
  const start = source.indexOf('  function renderBadge()')
  const end = source.indexOf('  function renderCost()', start)
  const state = { ofm: {}, balance: { ok: true, totalBalance: 22.81, currency: 'CNY' }, today: { amount: 1 }, ledger: { totalTokens: 123 } }
  const context = vm.createContext({ state, badgeInner: {}, walletLine: {}, formatTokenCount: String,
    money: amount => `¥${amount.toFixed(2)}`, shorten: String,
    ofmWalletText: () => '<img> 10 积分', escapeHtml: text => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;') })
  vm.runInContext(source.slice(start, end), context)
  context.renderWallet()
  assert.match(context.badgeInner.innerHTML, /Our Free Model/)
  assert.match(context.badgeInner.innerHTML, /123/)
  assert.match(context.badgeInner.innerHTML, /余额.*¥22.81/)
  assert.match(context.walletLine.innerHTML, /余额.*¥22.81/)
  assert.match(context.walletLine.innerHTML, /&lt;img&gt;/)
  assert.ok(!context.badgeInner.innerHTML.includes('<img>'))
  state.balance = { ok: false, error: 'offline' }
  context.renderWallet()
  assert.match(context.badgeInner.innerHTML, /offline/)
  assert.match(context.walletLine.innerHTML, /10 积分/)
})

test('a new summary poll does not discard a pending balance read; malformed replies remain errors', async () => {
  let release
  const { context, state } = harness(async (url, options) => {
    if (url.endsWith('/summary')) return response({ version: '2', channels: { state: 'ready' } })
    const body = JSON.parse(options.body)
    if (body.payload.method === 'provider.status') {
      await new Promise(resolve => { release = resolve })
      return response({ type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: { statuses: {} } } })
    }
    return response({ type: 'server-response', rpcId: 'wrong', result: { ok: true, value: {} } })
  })
  await context.detectOfm()
  const first = context.refreshOfmWallet()
  const wallet = state.ofm
  await context.detectOfm()
  assert.equal(state.ofm, wallet)
  release()
  await first
  assert.equal(state.ofm.stale, false)
  await assert.rejects(context.ofmRpc('credits.balances', { provider: 'buddy' }), /响应异常/)
  assert.equal(context.ofmBalanceText('buddy', [{ balance: { total: null } }]), '未提供额度')
})
