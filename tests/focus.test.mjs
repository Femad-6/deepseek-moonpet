import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createFocusTimer} from '../lib/focus.js'
const setup=()=>{let now=0;const alarms=[];let saved;const timer=createFocusTimer({now:()=>now,save:s=>{saved=structuredClone(s)},onAlarm:s=>alarms.push(s),dayKey:t=>String(Math.floor(t/86400000))});return{timer,alarms,advance:ms=>{now+=ms},saved:()=>saved,set:ms=>{now=ms}}}
test('work deadline records only work duration, signals once and requires manual rest',()=>{
 const s=setup();s.timer.command('start',{workMinutes:1,breakMinutes:1});s.advance(120000);s.timer.tick();s.timer.tick();
 const state=s.timer.snapshot();assert.equal(state.status,'finished');assert.equal(state.totalWorkMs,60000);assert.equal(state.sessions,1);assert.equal(s.alarms.length,1);
 s.timer.command('rest');s.advance(60000);s.timer.tick();assert.equal(s.timer.snapshot().mode,'break');assert.equal(s.timer.snapshot().totalWorkMs,60000);assert.equal(s.alarms.length,2)
})
test('pause and resume exclude paused time, stop preserves partial work',()=>{
 const s=setup();s.timer.command('start',{workMinutes:1});s.advance(10000);s.timer.command('pause');s.advance(50000);assert.equal(s.timer.snapshot().remainingMs,50000);
 s.timer.command('resume');s.advance(5000);s.timer.command('stop');assert.equal(s.timer.snapshot().totalWorkMs,15000);assert.equal(s.timer.snapshot().status,'idle')
})
test('restoring a running checkpoint pauses without counting time spent closed',()=>{
 const s=setup();s.timer.command('start',{workMinutes:1});s.advance(30000);s.timer.tick();
 const restore=createFocusTimer({initial:s.saved(),now:()=>300000,dayKey:t=>String(Math.floor(t/86400000))});assert.equal(restore.snapshot().status,'paused');assert.equal(restore.snapshot().remainingMs,30000);assert.equal(restore.snapshot().totalWorkMs,30000)
})
test('statistics split correctly across midnight',()=>{
 const s=setup();s.set(86400000-10000);s.timer.command('start',{workMinutes:1});s.advance(20000);assert.equal(s.timer.snapshot().todayWorkMs,10000);assert.equal(s.timer.snapshot().totalWorkMs,20000)
})
test('invalid settings and duplicate starts leave the timer intact',()=>{
 const s=setup();assert.throws(()=>s.timer.command('settings',{workMinutes:-1}));s.timer.command('start');assert.throws(()=>s.timer.command('start'));assert.throws(()=>s.timer.command('settings',{sound:'../../other.wav'}));assert.equal(s.timer.snapshot().status,'running')
})
test('dismiss clears alert and shutdown pauses a running timer',()=>{
 const s=setup();s.timer.command('start',{workMinutes:1});s.advance(60000);s.timer.tick();assert.equal(s.timer.snapshot().alertPending,true);s.timer.command('dismiss');assert.equal(s.timer.snapshot().alertPending,false);
 s.timer.command('start');s.advance(1000);s.timer.shutdown();assert.equal(s.timer.snapshot().status,'paused');assert.equal(s.timer.snapshot().totalWorkMs,61000)
})
test('damaged saved JSON cannot break bootstrap or create an invalid timer',()=>{
 const timer=createFocusTimer({initial:{version:1,status:'running',mode:'unknown',remainingMs:'NaN',days:null,totalWorkMs:-1,sessions:'bad',settings:{workMinutes:0,breakMinutes:999,sound:'../wrong'}},now:()=>0,dayKey:()=> 'today'})
 const state=timer.snapshot();assert.equal(state.status,'paused');assert.equal(state.remainingMs,25*60000);assert.equal(state.totalWorkMs,0);assert.equal(state.todayWorkMs,0);assert.equal(state.sessions,0);assert.equal(state.settings.sound,'bells')
})
test('changing idle work duration updates the countdown before starting',()=>{const s=setup();s.timer.command('settings',{workMinutes:50});assert.equal(s.timer.snapshot().remainingMs,50*60000)})
