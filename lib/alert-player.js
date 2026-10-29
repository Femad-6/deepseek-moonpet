import {spawn} from 'node:child_process'
import path from 'node:path'
import {FOCUS_SOUNDS} from './focus.js'

/** Windows WAV playback lives outside Chromium, so hiding the app does not mute reminders. */
export function createAlertPlayer({directory,platform=process.platform,spawnProcess=spawn}={}){
 let current=null,error='',volume=0.5
 function checkVolume(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new Error('音量应为 0–1')}
 function stop(){const child=current;current=null;child?.kill()}
 function setVolume(value){
  checkVolume(value)
  if(volume===value)return
  volume=value
  if(current)current.stdin.write(`${volume}\n`)
 }
 function play(id,{preview=false,volume:gain=volume}={}){
  if(!FOCUS_SOUNDS.some(s=>s.id===id))throw new Error('未知提醒音')
  checkVolume(gain)
  stop();error='';volume=gain
  if(platform!=='win32')return false
  const file=path.join(directory,id+'.wav').replace(/'/g,"''")
  // MediaPlayer gain is per-stream; stdin updates it without touching system volume.
  const script=`$ErrorActionPreference='Stop'
trap { [Console]::Error.WriteLine($_); exit 1 }
Add-Type -AssemblyName PresentationCore,WindowsBase
$player=New-Object System.Windows.Media.MediaPlayer
$player.Volume=${volume}
$dispatcher=[System.Windows.Threading.Dispatcher]::CurrentDispatcher
$reader=[System.IO.StreamReader]::new([Console]::OpenStandardInput())
$script:line=$reader.ReadLineAsync()
$script:exitCode=0
$player.add_MediaFailed({ $script:exitCode=1; $dispatcher.InvokeShutdown() })
$player.add_MediaEnded({ $player.Position=[TimeSpan]::Zero; $player.Play() })
$timer=New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval=[TimeSpan]::FromMilliseconds(50)
$clock=[System.Diagnostics.Stopwatch]::StartNew()
$timer.add_Tick({
 try {
  if($clock.Elapsed.TotalSeconds -ge ${preview?3:20}) { $dispatcher.InvokeShutdown(); return }
  if($script:line.IsCompleted) {
   $value=$script:line.GetAwaiter().GetResult()
   if($null -eq $value) { $dispatcher.InvokeShutdown(); return }
   $player.Volume=[double]::Parse($value,[Globalization.CultureInfo]::InvariantCulture)
   $script:line=$reader.ReadLineAsync()
  }
 } catch { $script:exitCode=1; $dispatcher.InvokeShutdown() }
})
$player.Open([Uri]::new('${file}'))
$player.Play()
$timer.Start()
[System.Windows.Threading.Dispatcher]::Run()
$timer.Stop()
$player.Close()
$reader.Dispose()
exit $script:exitCode`
  const child=spawnProcess('powershell.exe',['-NoProfile','-NonInteractive','-STA','-WindowStyle','Hidden','-Command',script],{windowsHide:true,stdio:['pipe','ignore','ignore']})
  current=child
  child.stdin.on('error',()=>{if(current===child){error='提醒音音量更新失败，请重试试听';stop()}})
  child.on('error',()=>{if(current===child){current=null;error='提醒音启动失败，请检查系统音量并重试试听'}})
  child.on('exit',code=>{if(current===child){current=null;if(code!==0&&code!==null)error='提醒音播放失败，请重试试听'}})
  return true
 }
 return{play,stop,setVolume,snapshot:()=>({native:platform==='win32',playing:Boolean(current),volume,error})}
}
