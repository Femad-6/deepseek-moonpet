import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createPackRegistry } from '../lib/packs.js'
import { DEFAULT_CONFIG, DEFAULT_DIALOG_GEOMETRY, imageSize } from '../lib/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => fs.readFileSync(path.join(root,rel), 'utf8')
test('new package has its own namespace, MIT attribution and Chinese defaults', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.name, 'dsh-moonpet')
  assert.equal(pkg.version, '0.1.0')
  assert.ok(read('cordis.patch.yml').includes('id: dsh-moonpet'))
  for (const name of fs.readdirSync(path.join(root,'lib'))) {
    assert.ok(!read(`lib/${name}`).includes('/dsh-gal'), name)
    assert.ok(!read(`lib/${name}`).includes('__dshGalWidget'), name)
  }
  assert.ok(read('LICENSE').includes('dsh-companion-widget contributors'))
  assert.equal(DEFAULT_CONFIG.lang, 'zh')
  assert.equal(DEFAULT_CONFIG.petEnabled, true)
})
test('all built-in states resolve to shipped alpha PNGs without upstream voices', () => {
  const registry = createPackRegistry({roots:[path.join(root,'assets/packs')]})
  assert.deepEqual(registry.all().map(p=>p.id), ['moon'])
  const pack=registry.get('moon')
  assert.equal(pack.sprites.length,3)
  assert.equal(pack.voices.length,0)
  const map=JSON.parse(read('assets/packs/moon/pet.json'))
  for(const status of ['idle','thinking','working','waiting','done','error','stopped','offline']){
    assert.ok(registry.resolveAsset('moon','sprite',map.sprites[status]), status)
  }
  assert.ok(!fs.existsSync(path.join(root,'assets/packs/neri')))
})
test('new UI images match shipped geometry and do not copy upstream artwork', () => {
  const geometry=JSON.parse(read('assets/ui/dialog.json'))
  assert.deepEqual(geometry, DEFAULT_DIALOG_GEOMETRY)
  const size=imageSize(fs.readFileSync(path.join(root,'assets/ui/dialog.png')))
  assert.equal(size.width,geometry.image.width)
  assert.equal(size.height,geometry.image.height)
  assert.equal(imageSize(fs.readFileSync(path.join(root,'assets/ui/settings.png'))).width,96)
})
