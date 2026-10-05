import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseScriptIndex } from '../lib/csv.js'

test('English-only transcript headers resolve without becoming a spoken header line', () => {
  const result=parseScriptIndex('clip,english\nen0001,"Keep going, one step at a time."\n')
  assert.equal(result.count,1)
  assert.equal(result.lines.en0001.en,'Keep going, one step at a time.')
  assert.equal(result.lines.clip,undefined)
})
test('English and Chinese translations coexist with old Japanese transcripts', () => {
  const result=parseScriptIndex('clip,japanese,chinese,english\none,こんにちは,你好,Hello\n')
  assert.equal(result.lines.one.ja,'こんにちは')
  assert.equal(result.lines.one.zh,'你好')
  assert.equal(result.lines.one.en,'Hello')
})
