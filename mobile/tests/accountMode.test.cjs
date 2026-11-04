const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=f=>ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${f}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const service={};vm.runInNewContext(compile('services/driverWorkspace.ts'),{exports:service});
function harness(){let role='driver',available=true,records=[],state=service.driverWorkspaceReducer(service.emptyDriverWorkspace(),{type:'enable',kind:'vehicle',now:100000});state=service.driverWorkspaceReducer(state,{type:'online',value:true});const alerts=[],api={};
 vm.runInNewContext(compile('components/AccountModeSwitch.tsx'),{exports:api,require(name){
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='react-native')return {Alert:{alert:(...args)=>alerts.push(args)},StyleSheet:{create:s=>s}};
  if(name.includes('RoleContext'))return {useRole:()=>({activeRole:role,driverAvailable:available,selectRole:next=>{role=next;}})};
  if(name.includes('DriverWorkspaceContext'))return {useDriverWorkspace:()=>({state,dispatch:action=>{state=service.driverWorkspaceReducer(state,action);}})};
  if(name.includes('ActivityContext'))return {useActivity:()=>({records})};
  if(name.includes('driverWorkspace'))return service;
  if(name.includes('i18n/ui'))return {translateUI:text=>text};
  if(name.includes('colors'))return {colors:{}};
  if(name.includes('LocalizedNative'))return {LocalizedPressable:'Pressable'};
  if(name.includes('AppText'))return {AppText:'Text'};
  if(name==='@expo/vector-icons')return {Ionicons:'Icon'};
  throw Error(name);
 }});return {render:()=>api.AccountModeSwitch(),click(){api.AccountModeSwitch().props.onPress();},alerts,get role(){return role;},get state(){return state;},activeDriver(){state={...state,job:{id:'active',phase:'in_progress'}};},activeRider(){role='rider';records=[{status:'active'}];},ordinaryRider(){role='rider';available=false;}};
}
test('same-account switching goes offline and preserves driver earnings/history in both directions',()=>{
 const app=harness(),history=app.state.history,balance=service.driverBalance(app.state);app.click();assert.equal(app.role,'rider');assert.equal(app.state.online,false);assert.equal(app.state.history,history);assert.equal(service.driverBalance(app.state),balance);assert.equal(app.render().props.accessibilityLabel,'Switch to driver');app.click();assert.equal(app.role,'driver');assert.equal(app.state.history,history);assert.equal(service.driverBalance(app.state),balance);
});
test('active driver jobs or rider bookings block mode changes without disturbing the trip',()=>{
 const driver=harness();driver.activeDriver();driver.click();assert.equal(driver.role,'driver');assert.equal(driver.state.job.id,'active');assert.equal(driver.alerts.length,1);const rider=harness();rider.activeRider();rider.click();assert.equal(rider.role,'rider');assert.equal(rider.alerts.length,1);
});
test('driver access remains available after switching to rider and resets on logout',()=>{
 let index=0;const slots=[],api={};vm.runInNewContext(compile('contexts/RoleContext.tsx'),{exports:api,require(name){if(name==='react')return {createContext:()=>({Provider:'Provider'}),useCallback:fn=>fn,useMemo:fn=>fn(),useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v];}};if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props})};return {};}});const render=()=>{index=0;return api.RoleProvider({children:null}).props.value;};render().selectRole('driver');assert.equal(render().driverAvailable,true);render().selectRole('rider');assert.equal(render().driverAvailable,true);render().selectRole(null);assert.equal(render().driverAvailable,false);const rider=harness();rider.ordinaryRider();assert.equal(rider.render(),null);
});
