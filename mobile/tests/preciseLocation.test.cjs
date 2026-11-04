const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require('typescript');
function harness(){
  let update,oneShot,removed=0,options; const timers=new Map();
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/services/preciseLocation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date:{now:()=>100000},setTimeout:(fn,delay)=>{timers.set(delay,fn);return delay;},clearTimeout:id=>timers.delete(id),require:()=>({Accuracy:{BestForNavigation:6,Highest:5},getCurrentPositionAsync:()=>new Promise(resolve=>{oneShot=resolve;}),watchPositionAsync:async (opts,callback)=>{options=opts;update=callback;return {remove(){removed++;}};}})});
  return {...exports,emit:location=>update(location),expire:()=>timers.get(20000)?.(),quick:()=>timers.get(6000)?.(),resolveOneShot:value=>oneShot(value),get removed(){return removed;},get options(){return options;}};
}
const fix=(accuracy=8,timestamp=100000)=>({coords:{latitude:4.155,longitude:9.24,accuracy},timestamp});
test('accepts fresh device readings while rejecting stale and invalid coordinates',()=>{
  const app=harness();
  assert.equal(app.usableLocation(fix(),100000),true);
  assert.equal(app.usableLocation(fix(100),100000),true);assert.equal(app.usableLocation(fix(null),100000),true);
  for(const value of [fix(-1),fix(8,50000),fix(8,120000),{...fix(),coords:{latitude:91,longitude:9,accuracy:3}}])assert.equal(app.usableLocation(value,100000),false);
});
test('waits for a precise fix and stops the device subscription immediately',async()=>{
  const app=harness();const promise=app.getPreciseLocation(new AbortController().signal);await Promise.resolve();
  assert.equal(app.options.accuracy,6);
  app.emit(fix(150));app.emit(fix(9));
  assert.equal((await promise).coords.accuracy,9);assert.equal(app.removed,1);
});
test('a poor GPS reading remains usable after acquisition; no reading and cancellation clean up',async()=>{
  const app=harness();const pending=app.getPreciseLocation(new AbortController().signal);await Promise.resolve();
  app.emit(fix(200));app.emit(fix(70));app.quick();assert.equal((await pending).coords.accuracy,70);assert.equal(app.removed,1);
  const empty=harness();const noFix=empty.getPreciseLocation(new AbortController().signal);await Promise.resolve();empty.expire();await assert.rejects(noFix,/unavailable/);assert.equal(empty.removed,1);
  const canceled=harness(),controller=new AbortController();const request=canceled.getPreciseLocation(controller.signal);await Promise.resolve();controller.abort();await assert.rejects(request,/canceled/);assert.equal(canceled.removed,1);
});

test('one-shot device reading works when the watch has not delivered a fix',async()=>{
  const app=harness();const pending=app.getPreciseLocation(new AbortController().signal);await Promise.resolve();
  app.resolveOneShot(fix(55));await Promise.resolve();app.quick();assert.equal((await pending).coords.accuracy,55);assert.equal(app.removed,1);
});
