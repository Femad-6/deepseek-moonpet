import {spawn} from 'node:child_process'
import path from 'node:path'
import {FOCUS_SOUNDS} from './focus.js'

/** Windows WAV playback lives outside Chromium, so hiding the app does not mute reminders. */
export function createAlertPlayer({directory,platform=process.platform,spawnProcess=spawn}={}){
 let current=null,error=''
 function stop(){if(current){current.kill();current=null}}
 function play(id,{preview=false}={}){
  if(!FOCUS_SOUNDS.some(s=>s.id===id))throw new Error('未知提醒音')
  stop();error=''
  if(platform!=='win32')return false
  const file=path.join(directory,id+'.wav').replace(/'/g,"''")
  const script=`$ErrorActionPreference='Stop'; $p=New-Object System.Media.SoundPlayer '${file}'; $p.Load(); $p.PlayLooping(); Start-Sleep -Seconds ${preview?3:20}; $p.Stop(); $p.Dispose()`
  const child=spawnProcess('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',script],{windowsHide:true,stdio:'ignore'})
  current=child
  child.on('error',()=>{if(current===child)current=null;error='提醒音启动失败，请检查系统音量并重试试听'})
  child.on('exit',code=>{if(current===child){current=null;if(code!==0&&code!==null)error='提醒音播放失败，请重试试听'}})
  return true
 }
 return{play,stop,snapshot:()=>({native:platform==='win32',playing:Boolean(current),error})}
}
