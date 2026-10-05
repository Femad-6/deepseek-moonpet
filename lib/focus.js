/** Persistent manual focus timer. Clock and sound are injected for offline tests. */
export const FOCUS_SOUNDS = [{id:'bells',name:'响亮钟声'},{id:'chime',name:'双音提示'},{id:'wind',name:'旋律风铃'}]
const validSound=id=>FOCUS_SOUNDS.some(s=>s.id===id)
export function createFocusTimer({initial,now=Date.now,save=()=>{},onAlarm=()=>{},dayKey=t=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(t)}={}){
 const state={version:1,status:'idle',mode:'work',remainingMs:25*60000,updatedAt:now(),settings:{workMinutes:25,breakMinutes:5,sound:'bells'},days:{},totalWorkMs:0,sessions:0,alertSeq:0,alertPending:false}
 if(initial&&initial.version===1){
  if(['work','break'].includes(initial.mode))state.mode=initial.mode
  if(['idle','running','paused','finished'].includes(initial.status))state.status=initial.status
  const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER
  for(const key of ['totalWorkMs','sessions','alertSeq'])if(nonnegative(initial[key]))state[key]=initial[key]
  state.alertPending=initial.alertPending===true
  const settings=initial.settings
  if(settings&&typeof settings==='object'&&!Array.isArray(settings)){
   for(const key of ['workMinutes','breakMinutes'])if(typeof settings[key]==='number'&&Number.isFinite(settings[key])&&settings[key]>=1&&settings[key]<=180)state.settings[key]=settings[key]
   if(validSound(settings.sound))state.settings.sound=settings.sound
  }
  const duration=state.settings[state.mode==='work'?'workMinutes':'breakMinutes']*60000
  state.remainingMs=nonnegative(initial.remainingMs)&&initial.remainingMs<=duration?initial.remainingMs:duration
  if(initial.days&&typeof initial.days==='object'&&!Array.isArray(initial.days))state.days=Object.fromEntries(Object.entries(initial.days).filter(([key,value])=>!['__proto__','constructor','prototype'].includes(key)&&key.length<=40&&nonnegative(value)))
  if(state.status==='running')state.status='paused'
  state.updatedAt=now()
 }
 let lastSaved=now()
 const persist=()=>{save(structuredClone(state));lastSaved=now()}
 function credit(from,to){
  if(to<=from)return
  state.totalWorkMs+=to-from
  while(from<to){
   const day=dayKey(from);let end=to
   if(dayKey(to-1)!==day){let low=from,high=to;while(high-low>1){const mid=Math.floor((low+high)/2);if(dayKey(mid)===day)low=mid;else high=mid}end=high}
   state.days[day]=(state.days[day]||0)+(end-from);from=end
  }
 }
 function tick(){
  if(state.status!=='running')return
  const at=now(),elapsed=Math.max(0,Math.min(state.remainingMs,at-state.updatedAt))
  if(state.mode==='work')credit(state.updatedAt,state.updatedAt+elapsed)
  state.remainingMs-=elapsed;state.updatedAt=Math.max(state.updatedAt,at)
  if(state.remainingMs===0){
   state.status='finished';state.alertSeq++;state.alertPending=true
   if(state.mode==='work')state.sessions++
   persist();onAlarm({mode:state.mode,sound:state.settings.sound,seq:state.alertSeq})
  }else if(at-lastSaved>=30000)persist()
 }
 function configure(patch){
  if(state.status==='running'||state.status==='paused')throw new Error('请先结束当前计时，再修改时长或提醒音')
  const next={...state.settings}
  for(const key of ['workMinutes','breakMinutes'])if(patch[key]!==undefined){const n=Number(patch[key]);if(!Number.isFinite(n)||n<1||n>180)throw new Error('时长应为 1–180 分钟');next[key]=n}
  if(patch.sound!==undefined){if(!validSound(patch.sound))throw new Error('未知提醒音');next.sound=patch.sound}
  state.settings=next
  if(state.status==='idle')state.remainingMs=next.workMinutes*60000
 }
 function begin(mode){state.mode=mode;state.status='running';state.remainingMs=state.settings[mode==='work'?'workMinutes':'breakMinutes']*60000;state.updatedAt=now();state.alertPending=false}
 function command(action,patch={}){
  tick()
  if(action==='settings')configure(patch)
  else if(action==='start'){if(!['idle','finished'].includes(state.status))throw new Error('当前计时尚未结束');configure(patch);begin('work')}
  else if(action==='rest'){if(state.status!=='finished'||state.mode!=='work')throw new Error('请先完成工作计时');begin('break')}
  else if(action==='pause'){if(state.status!=='running')throw new Error('当前没有运行中的计时');state.status='paused'}
  else if(action==='resume'){if(state.status!=='paused')throw new Error('当前计时未暂停');state.status='running';state.updatedAt=now()}
  else if(action==='stop'){state.status='idle';state.mode='work';state.remainingMs=state.settings.workMinutes*60000;state.alertPending=false}
  else if(action==='dismiss')state.alertPending=false
  else throw new Error('未知计时操作')
  persist();return snapshot()
 }
 function snapshot(){tick();return{...structuredClone(state),todayWorkMs:state.days[dayKey(now())]||0,serverNow:now(),sounds:FOCUS_SOUNDS}}
 function shutdown(){tick();if(state.status==='running')state.status='paused';persist()}
 return{tick,command,snapshot,shutdown}
}
