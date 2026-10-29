import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source=fs.readFileSync(new URL('../lib/client.js',import.meta.url),'utf8')
function mount(){
 const requests=[],timers=[],messages=[]
 const state={config:{volume:0.5}}
 const context=vm.createContext({state,API:'/api',AbortSignal,
  setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},
  showSaveStatus:(...args)=>messages.push(args),
  fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
 })
 vm.runInContext(source.slice(source.indexOf('  async function getJson('),source.indexOf('  // ── layout')),context)
 return{context,state,requests,timers,messages,flush:()=>new Promise(r=>setImmediate(r))}
}
const reply=(req,config)=>req.resolve({ok:true,json:async()=>({ok:true,config})})
test('settings serialize writes and keep newer local changes while an older save completes',async()=>{
 const app=mount(),{context,state,requests}=app
 state.config.volume=0.2;const first=context.save({volume:0.2},true)
 state.config.volume=0.8;const second=context.save({volume:0.8},true)
 assert.equal(requests.length,1)
 reply(requests[0],{volume:0.2});await app.flush()
 assert.equal(state.config.volume,0.8)
 assert.equal(requests.length,2)
 reply(requests[1],{volume:0.8});await Promise.all([first,second])
 assert.equal(state.config.volume,0.8)
})
test('failed saves retain edits for explicit retry and reject unsuccessful API replies',async()=>{
 const app=mount()
 const failed=app.context.save({volume:0},true)
 app.requests[0].resolve({ok:true,json:async()=>({ok:false,error:'disk full'})})
 await failed
 assert.ok(app.messages.some(args=>String(args[0]).includes('保存失败')))
 const retry=app.context.save({},true)
 assert.equal(JSON.parse(app.requests[1].options.body).volume,0)
 reply(app.requests[1],{volume:0});await retry
})
test('read and save requests carry deadlines and a rejected read can be retried',async()=>{
 const app=mount()
 const first=app.context.getJson('/turn')
 assert.ok(app.requests[0].options.signal)
 app.requests[0].reject(new DOMException('timeout','TimeoutError'))
 await assert.rejects(first)
 const next=app.context.getJson('/turn');reply(app.requests[1],{})
 await next
 const save=app.context.save({volume:0},true)
 assert.ok(app.requests[2].options.signal)
 reply(app.requests[2],{volume:0});await save
})
