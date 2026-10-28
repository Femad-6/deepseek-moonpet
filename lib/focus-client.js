/* MoonPet focus controls. Independent from character and dialogue rendering. */
;(function(){
 'use strict'
 if(window.__moonPetFocus)return
 window.__moonPetFocus=true
 // Derive milestones from the host's remaining time, never wall time while paused.
 function createFocusCompanion(){
  let previous=null,lastBucket=0,lastSchedule=null
  return s=>{
   const elapsed=Math.max(0,s.settings.workMinutes*60000-s.remainingMs)
   const minutes=Math.floor(elapsed/60000)
   const mode=s.settings.reminderMode||'interval',interval=s.settings.reminderMinutes||5
   const schedule=`${mode}:${interval}:${s.settings.workMinutes}`
   const changed=lastSchedule!==null&&schedule!==lastSchedule
   const bucket=mode==='milestones'?Math.min(3,Math.floor(elapsed/(s.settings.workMinutes*60000/4))):Math.floor(elapsed/(interval*60000))
   if(changed)lastBucket=bucket
   let kind=null
   if(s.mode==='work'&&s.status==='running'){
    if(!previous||previous.mode!=='work'||['idle','finished'].includes(previous.status)||s.remainingMs>previous.remainingMs){kind='start';lastBucket=bucket}
    else if(previous.status==='paused')kind='resume'
    else if(!changed&&bucket>lastBucket)kind='progress'
    lastBucket=Math.max(lastBucket,bucket)
   }else if(previous&&(s.status!==previous.status||s.mode!==previous.mode)){
    if(s.status==='paused')kind='pause'
    if(s.status==='finished')kind=s.mode==='work'?'finish':'rested'
    if(s.mode==='break'&&s.status==='running')kind='break'
   }
   if(s.status==='idle')lastBucket=0
   previous={status:s.status,mode:s.mode,remainingMs:s.remainingMs}
   lastSchedule=schedule
   return kind&&mode!=='off'&&!changed?{kind,minutes,elapsedMs:elapsed}:null
  }
 }
 function mount(){
  const panel=document.querySelector('.dmp-panel')
  if(!panel)return
  const api='/dsh-moonpet/api/focus'
  const section=document.createElement('details');section.className='dmp-details dmp-focus-section'
  section.innerHTML=`<summary><span>专注计时</span><span data-focus="summary">25:00</span><svg class="dmp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m8 5 7 7-7 7"/></svg></summary>
   <div class="dmp-focus-status" data-focus="status">准备开始工作</div>
   <div class="dmp-focus-clock" data-focus="clock">25:00</div>
   <div class="dmp-focus-totals"><span>今日 <b data-focus="today">00:00:00</b></span><span>累计 <b data-focus="total">00:00:00</b></span></div>
   <div class="dmp-focus-grid"><label>工作（分钟）<input class="dmp-num" data-focus="work" aria-label="工作分钟数" type="number" min="1" max="180" step="1" value="25"></label><label>休息（分钟）<input class="dmp-num" data-focus="break" aria-label="休息分钟数" type="number" min="1" max="180" step="1" value="5"></label></div>
   <label class="dmp-focus-sound">提醒音<select class="dmp-select" data-focus="sound" aria-label="番茄钟提醒音"><option value="bells">清脆颂钵</option><option value="chime">柔和双音</option><option value="wind">空灵八音盒</option><option value="harp">云朵竖琴</option><option value="water">竹林水滴</option><option value="piano">温暖电钢</option><option value="pulse">轻柔脉冲</option><option value="voice">语音温柔提醒</option><option value="soft">轻柔和弦</option><option value="digital">电子脉冲</option><option value="triple">三音铃声</option></select></label>
   <div class="dmp-hint">计时中也可切换 · 点击试听 3 秒 · 音量由系统控制</div>
   <label class="dmp-focus-sound" style="margin-top:14px">专注陪伴<select class="dmp-select" data-focus="reminder-mode" aria-label="专注陪伴方式"><option value="interval">按时间间隔鼓励</option><option value="milestones">按进度鼓励（25% / 50% / 75%）</option><option value="off">关闭主动陪伴语</option></select></label>
   <label class="dmp-focus-sound" data-focus="reminder-label" style="margin-top:10px">鼓励间隔（分钟）<input class="dmp-num" data-focus="reminder-minutes" aria-label="鼓励间隔分钟数" type="number" min="1" max="60" step="1" value="5" style="width:100%;box-sizing:border-box;margin-top:6px"></label>
   <div class="dmp-hint">即时保存 · 默认静音 · 关闭陪伴语仍保留到期响铃</div>
   <div class="dmp-focus-actions"><button class="dmp-btn dmp-focus-primary" data-focus="start" type="button">开始工作</button><button class="dmp-btn" data-focus="pause" type="button" disabled>暂停</button><button class="dmp-btn" data-focus="stop" type="button" disabled>结束</button></div>
   <div class="dmp-focus-actions"><button class="dmp-btn" data-focus="preview" type="button">试听 3 秒</button><button class="dmp-btn" data-focus="dismiss" type="button">停止提醒</button><button class="dmp-btn" data-focus="rest" type="button" hidden>开始休息</button></div>`
  panel.insertBefore(section,panel.querySelector('.dmp-details'))
  const notice=document.createElement('aside');notice.className='dmp-focus-notice';notice.hidden=true;notice.setAttribute('role','alert')
  notice.innerHTML='<strong data-notice="title">该休息一下了</strong><p data-notice="body">离开屏幕，放松一下。</p><div><button type="button" data-notice="rest">开始休息</button><button type="button" data-notice="dismiss">停止提醒</button></div>'
  document.body.appendChild(notice)
  const style=document.createElement('style');style.textContent=`
   .dmp-focus-section{margin:6px 0 16px;padding:14px;border:1px solid #a8d9ff20;border-radius:16px;background:linear-gradient(145deg,#a8d9ff0c,#a8d9ff02)}.dmp-focus-section summary>[data-focus="summary"]{margin-left:auto;margin-right:10px;color:#9ed8ff;font-variant-numeric:tabular-nums;padding:2px 8px;border-radius:999px;background:#9ed8ff12;border:1px solid #9ed8ff26}
   .dmp-focus-status{text-align:center;color:#9fb4ce;font-size:12px;margin-top:8px}.dmp-focus-clock{text-align:center;font-size:42px;font-weight:600;letter-spacing:.04em;color:#e1f2ff;font-variant-numeric:tabular-nums;margin:2px 0 10px}
   .dmp-focus-totals{display:flex;justify-content:space-between;font-size:10px;color:#91a6c1;padding-bottom:16px}.dmp-focus-totals b{font-weight:500;color:#c9dff6;font-variant-numeric:tabular-nums}
   .dmp-focus-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 14px}.dmp-focus-grid label{font-size:11px;color:#a1b5cf}.dmp-focus-grid>*{min-width:0}.dmp-focus-grid input{display:block;margin-top:6px;width:100%;text-align:left;box-sizing:border-box}.dmp-focus-sound{font-size:12px;color:#d0e4fa;display:block}
   .dmp-focus-actions{display:flex;gap:7px;margin-top:12px}.dmp-focus-actions .dmp-btn{flex:1;margin:0;padding:8px 5px;font-size:11px;min-width:0}.dmp-focus-actions .dmp-btn:disabled{opacity:.35;cursor:default}.dmp-focus-actions .dmp-focus-primary{background:#9ed8ff;color:#153650;border-color:transparent}.dmp-focus-section [hidden]{display:none}
   .dmp-focus-notice{position:fixed;right:24px;bottom:24px;z-index:2147483100;width:min(320px,calc(100vw - 48px));box-sizing:border-box;border:1px solid #9ed8ff66;background:#172536;color:#e5f3ff;border-radius:16px;padding:22px;box-shadow:0 12px 50px #0008;font-family:"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px}.dmp-focus-notice[hidden]{display:none}.dmp-focus-notice strong{font-size:18px}.dmp-focus-notice p{color:#abc3de;font-size:13px;line-height:1.6}.dmp-focus-notice div{display:flex;gap:9px}.dmp-focus-notice button{border:1px solid #ffffff20;background:#9ed8ff;color:#153650;border-radius:8px;padding:8px 12px;cursor:pointer}.dmp-focus-notice button:last-child{background:transparent;color:#d4e9ff}
  `;document.head.appendChild(style)
  const q=name=>section.querySelector(`[data-focus="${name}"]`)
  let current=null,busy=false,polling=false,lastAlarm=-1,fallbackAudio=null,fallbackStop=null,fallbackPreview=false
  const companion=createFocusCompanion()
  const clock=ms=>{const sec=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
  const total=ms=>{const sec=Math.max(0,Math.floor(ms/1000));return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':')}
  function stopFallback(){clearTimeout(fallbackStop);fallbackPreview=false;if(fallbackAudio){fallbackAudio.pause();fallbackAudio=null}}
  function playFallback(sound,preview=false){stopFallback();fallbackPreview=preview;fallbackAudio=new Audio(`/dsh-moonpet/asset/alert?sound=${encodeURIComponent(sound)}`);fallbackAudio.volume=1;fallbackAudio.loop=true;fallbackAudio.play().catch(()=>{q('status').textContent='浏览器阻止了声音，请点击试听启用'});fallbackStop=setTimeout(stopFallback,preview?3000:20000)}
  function render(s){
   document.dispatchEvent(new CustomEvent('moonpet:focus-state',{detail:{focus:s,message:companion(s)}}))
   current=s;const running=s.status==='running',paused=s.status==='paused',locked=running||paused
   q('clock').textContent=clock(s.remainingMs);q('summary').textContent=(s.mode==='break'?'休息 ':'')+clock(s.remainingMs)
   q('today').textContent=total(s.todayWorkMs);q('total').textContent=total(s.totalWorkMs)
   q('status').textContent=s.audio?.error||({idle:'准备开始工作',running:s.mode==='break'?'休息中':'专注工作中',paused:'计时已暂停',finished:s.mode==='work'?'工作完成，该休息一下了':'休息结束，可以开始下一轮'})[s.status]
   for(const [name,key] of [['work','workMinutes'],['break','breakMinutes'],['sound','sound']]){const el=q(name);if(document.activeElement!==el)el.value=s.settings[key];el.disabled=name!=='sound'&&locked}
   if(document.activeElement!==q('reminder-mode'))q('reminder-mode').value=s.settings.reminderMode||'interval'
   if(document.activeElement!==q('reminder-minutes'))q('reminder-minutes').value=s.settings.reminderMinutes||5
   q('reminder-label').hidden=(s.settings.reminderMode||'interval')!=='interval'
   q('start').disabled=running;q('start').textContent=paused?'继续计时':'开始工作';q('pause').disabled=!running;q('stop').disabled=!locked
   q('rest').hidden=!(s.status==='finished'&&s.mode==='work')
   notice.hidden=!s.alertPending;document.documentElement.dataset.moonpetFocusAlert=s.alertPending?'1':'0'
   notice.querySelector('[data-notice="title"]').textContent=s.mode==='work'?'该休息一下了':'休息结束了'
   notice.querySelector('[data-notice="body"]').textContent=s.mode==='work'?`这一轮已完成。离开屏幕，休息 ${s.settings.breakMinutes} 分钟。`:'准备好了就开始下一轮，保持自己的节奏。'
   notice.querySelector('[data-notice="rest"]').hidden=s.mode!=='work'
   if(s.alertPending&&s.alertSeq!==lastAlarm){lastAlarm=s.alertSeq;document.dispatchEvent(new Event('moonpet:focus-alarm'));if(!s.audio?.native)playFallback(s.settings.sound)}
   if(!s.alertPending&&!fallbackPreview)stopFallback()
  }
  async function command(action,settings){
   if(busy)return
   busy=true
   if(['dismiss','stop','rest','start'].includes(action))stopFallback()
   try{
    const res=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,settings,sound:q('sound').value})})
    const data=await res.json();if(!data.ok)throw new Error(data.error||'操作失败');render(data.focus)
    if(action==='preview'&&!data.focus.audio?.native)playFallback(q('sound').value,true)
   }catch(err){q('status').textContent=err instanceof SyntaxError?'请完全退出并重新打开 Harness，加载番茄钟':err.message}
   finally{busy=false}
  }
  q('start').addEventListener('click',()=>command(current?.status==='paused'?'resume':'start',{workMinutes:Number(q('work').value),breakMinutes:Number(q('break').value),sound:q('sound').value}))
  for(const action of ['pause','stop','rest','dismiss','preview'])q(action).addEventListener('click',()=>command(action))
  for(const name of ['work','break'])q(name).addEventListener('change',()=>command('settings',{workMinutes:Number(q('work').value),breakMinutes:Number(q('break').value)}))
  q('sound').addEventListener('change',()=>command('settings',{sound:q('sound').value}))
  q('reminder-mode').addEventListener('change',()=>command('settings',{reminderMode:q('reminder-mode').value}))
  q('reminder-minutes').addEventListener('change',()=>command('settings',{reminderMinutes:Number(q('reminder-minutes').value)}))
  for(const action of ['rest','dismiss'])notice.querySelector(`[data-notice="${action}"]`).addEventListener('click',()=>command(action))
  async function poll(){if(polling||busy)return;polling=true;try{const res=await fetch(api);const data=await res.json();if(data.ok&&data.focus)render(data.focus)}catch{/* Existing Host before restart, or temporarily offline. */}finally{polling=false}}
  setInterval(poll,1000);poll()
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount()
})()
