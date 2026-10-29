import {test} from 'node:test'
import assert from 'node:assert/strict'
import {writeAtomic} from '../lib/atomic-write.js'

test('atomic replacement writes a sibling temporary file before replacing the destination',()=>{
 const calls=[]
 writeAtomic('C:/data/config.json','new',{writeFileSync:(...args)=>calls.push(['write',...args]),renameSync:(...args)=>calls.push(['rename',...args])})
 assert.deepEqual(calls,[['write','C:/data/config.json.tmp','new','utf8'],['rename','C:/data/config.json.tmp','C:/data/config.json']])
})
test('a failed temporary write leaves the old file untouched and propagates failure',()=>{
 let renamed=false
 assert.throws(()=>writeAtomic('config.json','new',{writeFileSync(){throw new Error('disk full')},renameSync(){renamed=true}}),/disk full/)
 assert.equal(renamed,false)
})

test('replacement failures propagate instead of reporting a successful save',()=>{
 assert.throws(()=>writeAtomic('config.json','new',{writeFileSync(){},renameSync(){throw new Error('access denied')}}),/access denied/)
})
