import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const focusSource = fs.readFileSync(new URL('../lib/focus-client.js', import.meta.url), 'utf8')
function companion() {
  const start = focusSource.indexOf(' function createFocusCompanion(')
  assert.ok(start >= 0, 'focus companion is available')
  const context = vm.createContext({})
  vm.runInContext(focusSource.slice(start, focusSource.indexOf(' function mount()', start)), context)
  return context.createFocusCompanion()
}
const work = (minutes, status = 'running') => ({status, mode:'work', remainingMs:(25-minutes)*60000, settings:{workMinutes:25}})

test('focus encouragement follows actual elapsed milestones once, including resume and new rounds', () => {
  const update = companion()
  assert.equal(update(work(0)).kind, 'start')
  assert.equal(update(work(4.99)), null)
  assert.equal(update(work(5)).minutes, 5)
  assert.equal(update(work(5.1)), null)
  assert.equal(update(work(5.1, 'paused')).kind, 'pause')
  assert.equal(update(work(5.1, 'paused')), null)
  assert.equal(update(work(5.1)).kind, 'resume')
  assert.equal(update(work(10)).minutes, 10)
  assert.equal(update(work(25, 'finished')).kind, 'finish')
  assert.equal(update(work(25, 'finished')), null)
  assert.equal(update({...work(0), mode:'break'}).kind, 'break')
  assert.equal(update({...work(10), mode:'break'}), null)
  update(work(0, 'idle'))
  assert.equal(update(work(0)).kind, 'start')
  assert.equal(update(work(5)).minutes, 5)
})

test('late polls show current progress without replaying missed encouragements', () => {
  const update = companion()
  assert.equal(update(work(12)).minutes, 12)
  assert.equal(update(work(12.5)), null)
  assert.equal(update(work(22)).minutes, 22)
  assert.equal(update(work(22)), null)
})

test('custom intervals, milestone thresholds, off mode and live changes do not replay old reminders', () => {
  const update = companion()
  const snapshot = (minutes, reminderMode='interval', reminderMinutes=3) => ({...work(minutes),settings:{workMinutes:25,reminderMode,reminderMinutes}})
  update(snapshot(0))
  assert.equal(update(snapshot(2.99)),null)
  assert.equal(update(snapshot(3)).kind,'progress')
  assert.equal(update(snapshot(4,'milestones')),null)
  assert.equal(update(snapshot(6.24,'milestones')),null)
  assert.equal(update(snapshot(6.25,'milestones')).kind,'progress')
  assert.equal(update(snapshot(12.5,'milestones')).kind,'progress')
  assert.equal(update(snapshot(15,'off')),null)
  assert.equal(update({...snapshot(15,'off'),status:'paused'}),null)
  assert.equal(update(snapshot(18,'interval',2)),null)
  assert.equal(update(snapshot(20,'interval',2)).kind,'progress')
})

test('click responses reflect approval, task outcome and focus progress without requiring voice packs', () => {
  const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('  function companionLine(')
  assert.ok(start >= 0, 'contextual dialogue is available')
  const context = vm.createContext({})
  vm.runInContext(source.slice(start, source.indexOf('  let interactionCount', start)), context)
  assert.match(context.companionLine('waiting', work(7), 0), /确认/)
  assert.match(context.companionLine('idle', work(7), 0), /7 分钟/)
  assert.match(context.companionLine('error', null, 0), /一起/)
  assert.notEqual(context.companionLine('idle', null, 0), context.companionLine('idle', null, 1))
  assert.notEqual(context.companionLine('idle', work(7), 0), context.companionLine('idle', work(7), 1))
  assert.match(context.focusEncouragement('idle',work(20),0), /最后/)
  assert.match(context.focusEncouragement('working',work(13),0), /处理/)
  assert.match(context.companionLine('done',work(20),0), /完成/)
})
