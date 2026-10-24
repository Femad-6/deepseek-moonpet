import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { parseCsv } from '../lib/csv.js'

test('motivational catalogue has 25 unique clips with complete trilingual subtitles', () => {
  const rows = parseCsv(fs.readFileSync(new URL('../docs/motivational-subtitles.csv', import.meta.url), 'utf8'))
  assert.equal(rows.length, 26)
  const [header, ...lines] = rows
  assert.deepEqual(header, ['clip','chapter','speaker_jp','japanese','chinese','english','sec'])
  assert.equal(new Set(lines.map(row => row[0])).size, 25)
  for (const [index, row] of lines.entries()) {
    assert.equal(row[0], `en${String(index + 1).padStart(4, '0')}`)
    for (const column of [3, 4, 5]) assert.ok(row[column]?.trim(), `${row[0]} column ${column}`)
  }
})
