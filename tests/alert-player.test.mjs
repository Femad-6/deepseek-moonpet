import {test} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {createAlertPlayer} from '../lib/alert-player.js'
test('native sound helper uses bounded playback and stops the previous process',()=>{
 const calls=[],children=[]
 const player=createAlertPlayer({directory:"C:/Moon's Pet/alerts",platform:'win32',spawnProcess:(cmd,args,opts)=>{calls.push({cmd,args,opts});const child=new EventEmitter();child.killed=false;child.kill=()=>{child.killed=true};children.push(child);return child}})
 player.play('bells',{preview:true});assert.ok(calls[0].args.at(-1).includes('Seconds 3'));assert.ok(calls[0].args.at(-1).includes("Moon''s Pet"));assert.equal(calls[0].opts.windowsHide,true)
 player.play('wind');assert.equal(children[0].killed,true);assert.ok(calls[1].args.at(-1).includes('Seconds 20'))
 player.stop();assert.equal(children[1].killed,true);assert.equal(player.snapshot().playing,false);assert.throws(()=>player.play('../other'))
})
test('non-Windows hosts request browser fallback',()=>{const player=createAlertPlayer({directory:'/sounds',platform:'linux'});assert.equal(player.play('bells'),false);assert.equal(player.snapshot().native,false)})


test('every reminder option has a distinct playable bundled PCM WAV', async()=>{
 const {FOCUS_SOUNDS}=await import('../lib/focus.js')
 const fs=await import('node:fs');const {createHash}=await import('node:crypto')
 const hashes=new Set()
 assert.equal(FOCUS_SOUNDS.length,6)
 for(const sound of FOCUS_SOUNDS){
  const bytes=fs.readFileSync(new URL(`../assets/alerts/${sound.id}.wav`,import.meta.url))
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE')
  assert.equal(bytes.readUInt16LE(20),1,'uncompressed PCM for native playback')
  assert.ok(bytes.length>22050,'sound is not an empty placeholder')
  hashes.add(createHash('sha256').update(bytes).digest('hex'))
 }
 assert.equal(hashes.size,6)
})
