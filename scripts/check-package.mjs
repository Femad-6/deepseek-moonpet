import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const required=['package.json','cordis.patch.yml','README.md','LICENSE','THIRD_PARTY_NOTICES.md','assets/NOTICE.md','assets/icon.svg','lib/index.js','lib/client.js','lib/pet-state.js','assets/ui/dialog.png','assets/ui/dialog.json','assets/ui/dialog-blank.png','assets/ui/dialog-blank.json','assets/ui/settings.png','assets/ui/click.wav','assets/packs/moon/pack.json','assets/packs/moon/pet.json']
required.push('assets/packs/whale/pack.json','assets/packs/whale/pet.json')
required.push('lib/focus.js', 'lib/focus-client.js', 'lib/alert-player.js')
for (const sound of ['bells', 'chime', 'wind', 'harp', 'water', 'piano', 'pulse', 'voice', 'soft', 'digital', 'triple']) required.push(`assets/alerts/${sound}.wav`)
for (const state of ['idle','thinking','working','waiting','done','error','stopped','offline']) {
  required.push(`assets/packs/whale/sprites/${state}.png`)
}
for(const file of required)assert.ok(fs.existsSync(path.join(root,file)),`Missing ${file}`)
const npmCli=process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const run=spawnSync(process.execPath,[npmCli,'pack','--dry-run','--json','--ignore-scripts'],{cwd:root,encoding:'utf8',windowsHide:true})
assert.equal(run.status,0,run.stderr)
const [manifest]=JSON.parse(run.stdout)
const files=manifest.files.map(file=>file.path)
for (const file of required) assert.ok(files.includes(file), `Not packed: ${file}`)
for(const file of files){
  assert.ok(!/^(work|tests|\.github|node_modules|dist)\//.test(file),`Unexpected ${file}`)
  assert.ok(!file.includes('neri'),`Upstream demo ${file}`)
  assert.ok(!/(^|\/)(\.env|\.dsh|credentials)/.test(file),`Private ${file}`)
}
assert.equal(manifest.name,'dsh-moonpet')
// Two built-in characters now ship eleven PNGs rather than three.
assert.ok(manifest.size<16*1024*1024,'Release unexpectedly large')
console.log(JSON.stringify({name:manifest.name,version:manifest.version,bytes:manifest.size,files:files.length},null,2))
