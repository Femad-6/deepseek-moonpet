import {test} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {createAlertPlayer} from '../lib/alert-player.js'
test('native sound helper uses bounded playback and stops the previous process',()=>{
 const calls=[],children=[]
 const player=createAlertPlayer({directory:"C:/Moon's Pet/alerts",platform:'win32',spawnProcess:(cmd,args,opts)=>{calls.push({cmd,args,opts});const child=new EventEmitter();child.stdin=new EventEmitter();child.killed=false;child.kill=()=>{child.killed=true};children.push(child);return child}})
 player.play('bells',{preview:true});assert.ok(calls[0].args.at(-1).includes('TotalSeconds -ge 3'));assert.ok(calls[0].args.at(-1).includes("Moon''s Pet"));assert.equal(calls[0].opts.windowsHide,true)
 player.play('wind');assert.equal(children[0].killed,true);assert.ok(calls[1].args.at(-1).includes('TotalSeconds -ge 20'))
 player.stop();assert.equal(children[1].killed,true);assert.equal(player.snapshot().playing,false);assert.throws(()=>player.play('../other'))
})
test('non-Windows hosts request browser fallback',()=>{const player=createAlertPlayer({directory:'/sounds',platform:'linux'});assert.equal(player.play('bells'),false);assert.equal(player.snapshot().native,false)})

test('native reminders use the configured gain and update the active player without restarting',()=>{
 const calls=[],writes=[]
 const child=new EventEmitter()
 child.kill=()=>{}
 child.stdin=new EventEmitter()
 child.stdin.write=value=>writes.push(value)
 const player=createAlertPlayer({directory:'C:\\sounds',platform:'win32',spawnProcess:(cmd,args,opts)=>{calls.push({cmd,args,opts});return child}})
 player.play('bells',{volume:0.02})
 assert.equal(player.snapshot().volume,0.02)
 assert.match(calls[0].args.at(-1),/\$player\.Volume\s*=\s*0\.02/)
 player.setVolume(0)
 assert.equal(player.snapshot().volume,0)
 assert.deepEqual(writes,['0\n'])
 player.setVolume(1)
 assert.deepEqual(writes,['0\n','1\n'])
 assert.equal(calls.length,1)
 assert.throws(()=>player.setVolume(NaN))
 assert.throws(()=>player.play('bells',{volume:2}))
 child.stdin.emit('error',new Error('pipe closed'))
 assert.match(player.snapshot().error,/音量/)
})


test('every reminder option has a distinct playable bundled PCM WAV', async()=>{
 const {FOCUS_SOUNDS}=await import('../lib/focus.js')
 const fs=await import('node:fs');const {createHash}=await import('node:crypto')
 const hashes=new Set()
 assert.equal(FOCUS_SOUNDS.length,11)
 for(const sound of FOCUS_SOUNDS){
  const bytes=fs.readFileSync(new URL(`../assets/alerts/${sound.id}.wav`,import.meta.url))
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE')
  assert.equal(bytes.readUInt16LE(20),1,'uncompressed PCM for native playback')
  assert.ok(bytes.length>22050,'sound is not an empty placeholder')
  hashes.add(createHash('sha256').update(bytes).digest('hex'))
 }
 assert.equal(hashes.size,11)
})
