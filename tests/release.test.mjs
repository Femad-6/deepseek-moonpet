import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createPackRegistry } from '../lib/packs.js'
import { DEFAULT_CONFIG, DEFAULT_DIALOG_GEOMETRY, imageSize } from '../lib/index.js'
import { readPngAlphaBox } from '../lib/png-alpha.js'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => fs.readFileSync(path.join(root,rel), 'utf8')
test('declared plugin icon fits the DSH 256 KiB metadata limit', () => {
  const pkg = JSON.parse(read('package.json'))
  const bytes = fs.statSync(path.join(root, pkg.icon)).size
  assert.ok(bytes > 0, 'Plugin icon must not be empty')
  assert.ok(bytes <= 256 * 1024, `Plugin icon is ${bytes} bytes; DSH allows at most 262144`)
})
test('new package has its own namespace, MIT attribution and Chinese defaults', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.name, 'dsh-moonpet')
  assert.equal(pkg.version, '0.1.6')
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
  assert.deepEqual(registry.all().map(p=>p.id).sort(), ['moon', 'sakura', 'stella', 'whale', 'yuzu'])
  const pack=registry.get('moon')
  assert.equal(pack.sprites.length,3)
  assert.equal(pack.voices.length,0)
  const map=JSON.parse(read('assets/packs/moon/pet.json'))
  for(const status of ['idle','thinking','working','waiting','done','error','stopped','offline']){
    assert.ok(registry.resolveAsset('moon','sprite',map.sprites[status]), status)
  }
  assert.ok(!fs.existsSync(path.join(root,'assets/packs/neri')))
})
for (const character of ['whale', 'sakura', 'stella', 'yuzu']) test(`${character} ships eight distinct, transparent state sprites at a consistent size`, () => {
  const registry = createPackRegistry({roots:[path.join(root,'assets/packs')]})
  const pack = registry.get(character)
  assert.ok(pack, `${character} is discoverable in the built-in character selector`)
  assert.equal(pack.defaultSprite, 'idle.png')
  assert.equal(pack.voices.length, 0)
  const states = ['idle','thinking','working','waiting','done','error','stopped','offline']
  const map = JSON.parse(read(`assets/packs/${character}/pet.json`)).sprites
  assert.deepEqual(Object.keys(map).sort(), states.slice().sort())
  assert.equal(pack.sprites.length, states.length)
  const hashes = new Set(), sizes = new Set()
  for (const state of states) {
    const asset = registry.resolveAsset(character, 'sprite', map[state])
    assert.ok(asset, state)
    const bytes = fs.readFileSync(path.join(pack.spriteDir, map[state]))
    const alpha = readPngAlphaBox(bytes)
    assert.ok(alpha?.box, `${state} has visible art`)
    assert.ok(alpha.box.w < alpha.width && alpha.box.h < alpha.height, `${state} has transparent margins`)
    sizes.add(`${alpha.width}x${alpha.height}`)
    hashes.add(createHash('sha256').update(bytes).digest('hex'))
  }
  assert.equal(sizes.size, 1, 'state changes preserve canvas size')
  assert.equal(hashes.size, states.length, 'each state has its own artwork')
})
test('new UI images match shipped geometry and do not copy upstream artwork', () => {
  const geometry=JSON.parse(read('assets/ui/dialog.json'))
  assert.deepEqual(geometry, DEFAULT_DIALOG_GEOMETRY)
  const size=imageSize(fs.readFileSync(path.join(root,'assets/ui/dialog.png')))
  assert.equal(size.width,geometry.image.width)
  assert.equal(size.height,geometry.image.height)
  assert.equal(imageSize(fs.readFileSync(path.join(root,'assets/ui/settings.png'))).width,96)
})
