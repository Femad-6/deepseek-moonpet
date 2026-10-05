/* MoonPet focus controls. Independent from character and dialogue rendering. */
;(function(){
 'use strict'
 if(window.__moonPetFocus)return
 window.__moonPetFocus=true
 function mount(){
  const panel=document.querySelector('.dmp-panel')
  if(!panel)return
  const api='/dsh-moonpet/api/focus'
  const section=document.createElement('details');section.className='dmp-details dmp-focus-section'
  section.innerHTML=`<summary>专注计时 <span data-focus="summary">25:00</span></summary>
   <div class="dmp-focus-status" data-focus="status">准备开始工作</div>
   <div class="dmp-focus-clock" data-focus="clock">25:00</div>
   <div class="dmp-focus-totals"><span>今日 <b data-focus="today">00:00:00</b></span><span>累计 <b data-focus="total">00:00:00</b></span></div>
   <div class="dmp-focus-grid"><label>工作（分钟）<input class="dmp-num" data-focus="work" aria-label="工作分钟数" type="number" min="1" max="180" step="1" value="25"></label><label>休息（分钟）<input class="dmp-num" data-focus="break" aria-label="休息分钟数" type="number" min="1" max="180" step="1" value="5"></label></div>
   <label class="dmp-focus-sound">提醒音<select class="dmp-select" data-focus="sound" aria-label="番茄钟提醒音"><option value="bells">响亮钟声</option><option value="chime">双音提示</option><option value="wind">旋律风铃</option></select></label>
   <div class="dmp-hint">响亮提醒 · 最长 20 秒 · 音量由系统控制</div>
   <div class="dmp-focus-actions"><button class="dmp-btn dmp-focus-primary" data-focus="start" type="button">开始工作</button><button class="dmp-btn" data-focus="pause" type="button" disabled>暂停</button><button class="dmp-btn" data-focus="stop" type="button" disabled>结束</button></div>
   <div class="dmp-focus-actions"><button class="dmp-btn" data-focus="preview" type="button">试听 3 秒</button><button class="dmp-btn" data-focus="dismiss" type="button">停止提醒</button><button class="dmp-btn" data-focus="rest" type="button" hidden>开始休息</button></div>`
  panel.insertBefore(section,panel.querySelector('.dmp-details'))
  const notice=document.createElement('aside');notice.className='dmp-focus-notice';notice.hidden=true;notice.setAttribute('role','alert')
  notice.innerHTML='<strong data-notice="title">该休息一下了</strong><p data-notice="body">离开屏幕，放松一下。</p><div><button type="button" data-notice="rest">开始休息</button><button type="button" data-notice="dismiss">停止提醒</button></div>'
  document.body.appendChild(notice)
  const style=document.createElement('style');style.textContent=`
   .dmp-focus-section{margin-bottom:16px}.dmp-focus-section summary>span{margin-left:auto;margin-right:10px;color:#a8dfca;font-variant-numeric:tabular-nums}
   .dmp-focus-status{text-align:center;color:#a8bdb3;font-size:12px;margin-top:8px}.dmp-focus-clock{text-align:center;font-size:36px;font-weight:550;letter-spacing:.04em;color:#e1f5eb;font-variant-numeric:tabular-nums;margin:2px 0 10px}
   .dmp-focus-totals{display:flex;justify-content:space-between;font-size:10px;color:#8ba398;padding-bottom:16px}.dmp-focus-totals b{font-weight:500;color:#d1e1d9;font-variant-numeric:tabular-nums}
   .dmp-focus-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 14px}.dmp-focus-grid label{font-size:11px;color:#9caea5}.dmp-focus-grid input{display:block;margin-top:6px;width:100%;text-align:left;box-sizing:border-box}.dmp-focus-sound{font-size:12px;color:#d3e5db;display:block}
   .dmp-focus-actions{display:flex;gap:7px;margin-top:12px}.dmp-focus-actions .dmp-btn{flex:1;margin:0;padding:8px 5px;font-size:11px}.dmp-focus-actions .dmp-btn:disabled{opacity:.35;cursor:default}.dmp-focus-actions .dmp-focus-primary{background:#93cdb6;color:#142d23;border-color:transparent}.dmp-focus-actions [hidden]{display:none}
   .dmp-focus-notice{position:fixed;right:24px;bottom:24px;z-index:2147483100;width:min(320px,calc(100vw - 48px));box-sizing:border-box;border:1px solid #92cfac66;background:#202c27;color:#e5f5eb;border-radius:16px;padding:22px;box-shadow:0 12px 50px #0008;font-family:"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px}.dmp-focus-notice[hidden]{display:none}.dmp-focus-notice strong{font-size:18px}.dmp-focus-notice p{color:#abc3b6;font-size:13px;line-height:1.6}.dmp-focus-notice div{display:flex;gap:9px}.dmp-focus-notice button{border:1px solid #ffffff20;background:#83bea1;color:#12291c;border-radius:8px;padding:8px 12px;cursor:pointer}.dmp-focus-notice button:last-child{background:transparent;color:#d4e9dc}
  `;document.head.appendChild(style)
  const q=name=>section.querySelector(`[data-focus="${name}"]`)
  let current=null,busy=false,polling=false,lastAlarm=-1,fallbackAudio=null,fallbackStop=null,fallbackPreview=false
  const clock=ms=>{const sec=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`}
  const total=ms=>{const sec=Math.max(0,Math.floor(ms/1000));return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':')}
  function stopFallback(){clearTimeout(fallbackStop);fallbackPreview=false;if(fallbackAudio){fallbackAudio.pause();fallbackAudio=null}}
  function playFallback(sound,preview=false){stopFallback();fallbackPreview=preview;fallbackAudio=new Audio(`/dsh-moonpet/asset/alert?sound=${encodeURIComponent(sound)}`);fallbackAudio.volume=1;fallbackAudio.loop=true;fallbackAudio.play().catch(()=>{q('status').textContent='浏览器阻止了声音，请点击试听启用'});fallbackStop=setTimeout(stopFallback,preview?3000:20000)}
  function render(s){
   current=s;const running=s.status==='running',paused=s.status==='paused',locked=running||paused
   q('clock').textContent=clock(s.remainingMs);q('summary').textContent=(s.mode==='break'?'休息 ':'')+clock(s.remainingMs)
   q('today').textContent=total(s.todayWorkMs);q('total').textContent=total(s.totalWorkMs)
   q('status').textContent=s.audio?.error||({idle:'准备开始工作',running:s.mode==='break'?'休息中':'专注工作中',paused:'计时已暂停',finished:s.mode==='work'?'工作完成，该休息一下了':'休息结束，可以开始下一轮'})[s.status]
   for(const [name,key] of [['work','workMinutes'],['break','breakMinutes'],['sound','sound']]){const el=q(name);if(document.activeElement!==el)el.value=s.settings[key];el.disabled=locked}
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
  for(const name of ['work','break','sound'])q(name).addEventListener('change',()=>command('settings',{workMinutes:Number(q('work').value),breakMinutes:Number(q('break').value),sound:q('sound').value}))
  for(const action of ['rest','dismiss'])notice.querySelector(`[data-notice="${action}"]`).addEventListener('click',()=>command(action))
  async function poll(){if(polling||busy)return;polling=true;try{const res=await fetch(api);const data=await res.json();if(data.ok&&data.focus)render(data.focus)}catch{/* Existing Host before restart, or temporarily offline. */}finally{polling=false}}
  setInterval(poll,1000);poll()
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount()
})()
