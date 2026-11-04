const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/services/selfieChallenge.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api});
const face={x:.25,y:.2,width:.5,height:.6,yaw:0,roll:0,leftEye:.9,rightEye:.9,trackingId:1};
function run(){let state=api.newSelfieChallenge(),now=0;const actions=[];return {actions,get state(){return state;},tick(ms=100,patch={},faces){now+=ms;state=api.advanceSelfieChallenge(state,faces??[{...face,...patch}],now);if(state.action)actions.push(state.action);return state;},hold(ms,patch={}){for(let i=0;i<ms;i+=100)this.tick(100,patch);return state;}};}
test('capture starts only after sustained alignment and saves only after observed turn, return and two blinks',()=>{
 const app=run();app.hold(1000);assert.equal(app.state.phase,'align');app.tick();assert.equal(app.state.action,'start');app.hold(1700);assert.equal(app.state.phase,'turn');
 app.hold(1000);assert.equal(app.state.phase,'turn');app.hold(600,{yaw:28});assert.equal(app.state.phase,'centre');app.hold(700);assert.equal(app.state.phase,'blink');
 app.hold(1500);assert.equal(app.state.blinks,0);app.tick(100,{leftEye:.1,rightEye:.1});app.tick(150);assert.equal(app.state.blinks,1);app.tick(100,{leftEye:.1,rightEye:.1});app.tick(150);app.hold(2000);assert.equal(app.actions.filter(a=>a==='save').length,1);assert.equal(app.state.phase,'complete');app.tick();assert.equal(app.state.action,undefined);
});
test('off-centre faces, invalid signals, multiple faces, lost detection and identity changes cannot complete capture',()=>{
 const app=run();app.hold(2000,{x:0,width:.2});assert.equal(app.state.phase,'align');app.hold(2000,{leftEye:NaN});assert.equal(app.state.phase,'align');app.hold(1300);assert.equal(app.state.phase,'straight');app.tick(100,{},[face,face]);assert.equal(app.state.action,'cancel');
 app.hold(1300);app.tick(100,{},[]);app.tick(950,{},[]);assert.equal(app.state.action,'cancel');app.hold(1300);app.tick(100,{trackingId:2});assert.equal(app.state.action,'cancel');
});
test('a frozen camera or simply waiting cannot satisfy the movements',()=>{
 const app=run();app.hold(3000);app.tick(2000);assert.equal(app.state.action,'cancel');app.hold(3000);app.hold(31000);assert.notEqual(app.state.phase,'complete');
});
