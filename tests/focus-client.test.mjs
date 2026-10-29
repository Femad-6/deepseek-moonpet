import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {createFocusTimer} from '../lib/focus.js'

const source=fs.readFileSync(new URL('../lib/focus-client.js',import.meta.url),'utf8')
function mount({beforeRequest=async()=>{}}={}){
 const elements=new Map(),events=new Map(),intervals=[],audios=[],requests=[]
 const element=key=>{
  if(!elements.has(key))elements.set(key,{
   value:'',hidden:false,textContent:'',listeners:new Map(),
   querySelector:selector=>element(selector),setAttribute(){},appendChild(){},insertBefore(){},
   addEventListener(name,fn){this.listeners.set(name,fn)},
  })
  return elements.get(key)
 }
 let now=0,volume=0.02
 const timer=createFocusTimer({now:()=>now,dayKey:()=> 'today'})
 const snapshot=()=>({...timer.snapshot(),audio:{native:false,volume}})
 const document={
  readyState:'complete',documentElement:{dataset:{}},head:element('head'),body:element('body'),
  querySelector:element,createElement:tag=>element(tag),
  addEventListener(name,fn){events.set(name,fn)},
  dispatchEvent(event){events.get(event.type)?.(event)},
 }
 const context=vm.createContext({
  window:{},document,
  Event:class{constructor(type){this.type=type}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
  Audio:class{constructor(){this.volume=1;audios.push(this)}play(){return Promise.resolve()}pause(){this.paused=true}},
  setInterval:fn=>intervals.push(fn),setTimeout:()=>1,clearTimeout(){},
  fetch:async(url,options)=>{
   if(options){
    const body=JSON.parse(options.body);requests.push(body);await beforeRequest(body)
    if(body.action!=='preview')timer.command(body.action,body.settings)
   }
   return{json:async()=>({ok:true,focus:snapshot()})}
  },
 })
 vm.runInContext(source,context)
 const flush=()=>new Promise(resolve=>setImmediate(resolve))
 return{element,document,audios,requests,timer,flush,poll:async()=>{await intervals[0]();await flush()},advance:ms=>{now+=ms},setVolume:value=>{volume=value}}
}

test('browser preview and alarms follow saved volume, live slider changes and mute',async()=>{
 const app=mount();await app.flush()
 await app.element('[data-focus="preview"]').listeners.get('click')()
 await app.flush()
 assert.equal(app.audios.at(-1).volume,0.02)
 app.document.dispatchEvent({type:'moonpet:volume',detail:{volume:0}})
 assert.equal(app.audios.at(-1).volume,0)
 await app.poll()
 assert.equal(app.audios.at(-1).volume,0,'a stale poll must not undo mute while its save is in flight')
 app.setVolume(0)
 await app.poll()
 app.setVolume(1)
 await app.poll()
 assert.equal(app.audios.at(-1).volume,1)
 app.timer.command('start',{workMinutes:1})
 app.advance(60000)
 await app.poll()
 assert.equal(app.audios.at(-1).volume,1)
 app.setVolume(0)
 await app.poll()
 assert.equal(app.audios.at(-1).volume,0)
})

test('a busy command reports a retryable start error instead of leaving the dialogue button disabled',async()=>{
 let finishPreview
 const pending=new Promise(resolve=>{finishPreview=resolve})
 const app=mount({beforeRequest:body=>body.action==='preview'?pending:undefined})
 await app.flush()
 app.timer.command('start',{workMinutes:1,breakMinutes:1})
 app.advance(60000);app.timer.command('rest');app.advance(60000)
 await app.poll()
 const errors=[]
 app.document.addEventListener('moonpet:focus-error',event=>errors.push(event.detail))
 const preview=app.element('[data-focus="preview"]').listeners.get('click')()
 app.document.dispatchEvent({type:'moonpet:focus-start'})
 finishPreview();await preview;await app.flush()
 assert.equal(errors.length,1)
 assert.equal(errors[0].action,'start')
 app.document.dispatchEvent({type:'moonpet:focus-start'})
 await app.flush()
 assert.equal(app.timer.snapshot().status,'running')
})

test('dialogue start action begins exactly one fresh round using saved durations and clears the alarm',async()=>{
 const app=mount();await app.flush()
 app.timer.command('start',{workMinutes:1,breakMinutes:1,reminderMode:'off'})
 app.advance(60000);app.timer.command('rest');app.advance(60000)
 await app.poll()
 assert.equal(app.timer.snapshot().status,'finished')
 app.document.dispatchEvent({type:'moonpet:focus-start'})
 app.document.dispatchEvent({type:'moonpet:focus-start'})
 await app.flush()
 assert.equal(app.requests.filter(r=>r.action==='start').length,1)
 const state=app.timer.snapshot()
 assert.equal(state.status,'running')
 assert.equal(state.mode,'work')
 assert.equal(state.remainingMs,60000)
 assert.equal(state.alertPending,false)
 assert.equal(state.totalWorkMs,60000)
 assert.equal(app.audios.at(-1).paused,true)
})
