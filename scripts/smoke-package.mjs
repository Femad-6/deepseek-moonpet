/** Offline smoke check against an extracted npm package. Leaves its scratch files intact. */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'

const packageDir=path.resolve(process.argv[2] || '.')
process.env.DSH_HOME=path.resolve('work',`package-smoke-${Date.now()}`)
const { apply }=await import(pathToFileURL(path.join(packageDir,'lib/index.js')).href)
const routes=new Map(), listeners=new Map()
apply({webServer:{register(route){routes.set(route.path,route.handler);return()=>{}},tapIndex(){return()=>{}}},credentials:{async resolve(){return null}},on(name,fn){listeners.set(name,fn);return()=>{}},effect(fn){fn()}})
async function read(route,headers={}){
  return new Promise((resolve,reject)=>{
    const req=new Readable({read(){}});req.method='GET';req.url=route;req.headers=headers
    const handler=routes.get(route.split('?')[0]);assert.ok(handler,route)
    const res={writeHead(status,headers){this.status=status;this.headers=headers},end(bytes){resolve({status:this.status,headers:this.headers,bytes:Buffer.from(bytes??'')})}}
    Promise.resolve(handler(req,res)).catch(reject);req.push(null)
  })
}
const json=async route=>JSON.parse((await read(route)).bytes.toString())
const boot=await json('/dsh-moonpet/api/bootstrap')
assert.equal(boot.config.spritePack,'moon')
assert.equal(boot.config.lang,'zh')
assert.equal(boot.pet.enabled,true)
assert.equal(boot.pet.sprite.file,'idle.png')
const emit=(type,data)=>listeners.get('session/event')({id:'smoke'},{type,data})
for(const [type,data,status,file] of [
  ['turn/start',{turn:1},'thinking','thinking.png'],
  ['tool/call',{turn:1,callId:'t',name:'read_file',arguments:'{}'},'working','thinking.png'],
  ['approval/asked',{id:'a'},'waiting','wave.png'],
  ['approval/decided',{id:'a',outcome:'allowed-once'},'working','thinking.png'],
  ['tool/result',{turn:1,message:{toolCallId:'t',role:'tool',content:[]}},'thinking','thinking.png'],
  ['turn/end',{turn:1,reason:{kind:'completed'}},'done','wave.png']
]){
  emit(type,data);const response=await json('/dsh-moonpet/api/turn')
  assert.equal(response.pet.status,status);assert.equal(response.pet.sprite.file,file)
  const art=await read(response.pet.sprite.url)
  assert.equal(art.status,200);assert.equal(art.headers['Content-Type'],'image/png')
}
assert.equal((await read('/dsh-moonpet/api/turn',{host:'127.0.0.1',origin:'https://untrusted.invalid'})).status,403)
for(const name of ['dialog.png','settings.png','click.wav'])assert.equal((await read(`/dsh-moonpet/asset/ui/${name}`)).status,200)
assert.equal(routes.has('/dsh-gal/api/turn'),false)
console.log('Packed package smoke passed: fresh install, six real-shape event transitions, art/UI routes, namespace isolation and cross-origin guard.')
