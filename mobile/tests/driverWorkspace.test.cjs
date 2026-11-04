const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/services/driverWorkspace.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api});
const start=(kind='vehicle')=>api.driverWorkspaceReducer(api.emptyDriverWorkspace(),{type:'enable',kind,now:100000000});
const reduce=api.driverWorkspaceReducer;
function offer(kind='vehicle'){let state=start(kind);state=reduce(state,{type:'online',value:true});state=reduce(state,{type:'offer',id:'test-trip',now:100});return state;}
test('driver requests require online demo mode, and active trips cannot be overwritten or switched offline',()=>{
 const empty=api.emptyDriverWorkspace();assert.equal(reduce(empty,{type:'online',value:true}),empty);
 let state=start();assert.equal(reduce(state,{type:'offer',id:'no',now:1}),state);state=offer();state=reduce(state,{type:'accept'});assert.equal(state.job.phase,'to_pickup');assert.equal(reduce(state,{type:'online',value:false}),state);assert.equal(reduce(state,{type:'kind',kind:'bike'}),state);assert.equal(reduce(state,{type:'offer',id:'other',now:2}),state);
});
test('ride requires rider PIN and credits the completed trip once; late actions cannot change terminal history',()=>{
 let state=reduce(offer(),{type:'accept'});state=reduce(state,{type:'advance',now:200});assert.equal(state.job.phase,'arrived');assert.equal(reduce(state,{type:'advance',pin:'0000',now:300}),state);state=reduce(state,{type:'advance',pin:api.DEMO_DRIVER.pin,now:400});assert.equal(state.job.phase,'in_progress');assert.equal(reduce(state,{type:'cancel',reason:'late',now:500}),state);state=reduce(state,{type:'advance',now:600});const balance=api.driverBalance(state);state=reduce(state,{type:'advance',now:700});assert.equal(api.driverBalance(state),balance+2250);const done=state;state=reduce(state,{type:'advance',now:800});assert.equal(state,done);assert.equal(state.history.filter(j=>j.id==='test-trip').length,1);assert.equal(reduce(state,{type:'cancel',reason:'late',now:900}),state);
});
test('courier must confirm collection and verify recipient PIN before earnings are credited',()=>{
 let state=reduce(offer('bike'),{type:'accept'});for(const now of [1,2,3])state=reduce(state,{type:'advance',now});assert.equal(state.job.phase,'at_dropoff');assert.equal(reduce(state,{type:'advance',pin:'0000',now:4}),state);const balance=api.driverBalance(state);state=reduce(state,{type:'advance',pin:api.DEMO_DRIVER.deliveryPin,now:5});assert.equal(state.job.phase,'completed');assert.equal(api.driverBalance(state),balance+1800);
});
test('cancellation requires a reason and adds no income; rating cannot change the amount',()=>{
 let state=reduce(offer(),{type:'accept'}),before=api.driverBalance(state);assert.equal(reduce(state,{type:'cancel',reason:' ',now:1}),state);state=reduce(state,{type:'cancel',reason:'Vehicle issue',now:2});assert.equal(state.job.phase,'canceled');assert.equal(api.driverBalance(state),before);state=reduce(state,{type:'rate',id:state.history[1].id,rating:5});assert.equal(api.driverBalance(state),before);
});
test('payout reserves funds once, cannot overdraw, and a failed payout releases its reservation once',()=>{
 let state=start();const before=api.driverBalance(state),payout={id:'p1',amount:1000,provider:'MTN MoMo',phone:'699000001',status:'processing',createdAt:1};state=reduce(state,{type:'payout',payout});assert.equal(api.driverBalance(state),before-1000);assert.equal(reduce(state,{type:'payout',payout}),state);assert.equal(reduce(state,{type:'payout',payout:{...payout,id:'overdraft',amount:before}}),state);state=reduce(state,{type:'payout-result',id:'p1',status:'failed'});assert.equal(api.driverBalance(state),before);state=reduce(state,{type:'payout-result',id:'p1',status:'paid'});assert.equal(api.driverBalance(state),before);assert.equal(state.payouts[0].status,'failed');assert.ok(api.payoutProblem(100,'bad',before));
});
test('reset removes all demo jobs, earnings, payouts and online state',()=>{const state=reduce(offer(),{type:'reset'});assert.equal(state.enabled,false);assert.equal(state.online,false);assert.equal(state.history.length,0);assert.equal(api.driverBalance(state),0);});
