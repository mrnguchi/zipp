const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=f=>ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${f}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const service={};vm.runInNewContext(compile('services/driverWorkspace.ts'),{exports:service});
function harness(){
 let state=service.driverWorkspaceReducer(service.emptyDriverWorkspace(),{type:'enable',kind:'vehicle',now:10000000});state=service.driverWorkspaceReducer(state,{type:'online',value:true});state=service.driverWorkspaceReducer(state,{type:'offer',id:'ui-trip',now:1});
 let route={name:'DriverOffer'},index=0,tree;const slots=[],exports={},calls=[],contacts=[];const jsx=(type,props)=>({type,props});
 const navigation={navigate(name,params){calls.push(name);route={name,params};},replace(name,params){calls.push(name);route={name,params};},goBack(){},reset(){}};
 vm.runInNewContext(compile('screens/driver/DriverScreens.tsx'),{exports,__DEV__:true,require(name){
  if(name==='react')return {useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=index++;return slots[i]??={current:initial};}};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='react-native')return {View:'View',ScrollView:'ScrollView',StyleSheet:{create:s=>s},Share:{share:async()=>({})}};
  if(name==='@react-navigation/native')return {useNavigation:()=>navigation,useRoute:()=>route};
  if(name.includes('DriverWorkspaceContext'))return {useDriverWorkspace:()=>({state,dispatch:action=>{state=service.driverWorkspaceReducer(state,action);},enableDemo(){}})};
  if(name.includes('MessagingContext'))return {useMessaging:()=>({ensureConversation:c=>contacts.push(c)})};
  if(name.includes('driverWorkspace'))return service;
  if(name.includes('ActionButton'))return {ActionButton:'ActionButton'};
  if(name.includes('FormField'))return {FormField:'FormField'};
  if(name.includes('AppText'))return {AppText:'Text'};
  if(name.includes('colors'))return {colors:{}};
  return {};
 }});
 function render(){index=0;tree=exports.DriverCoreScreen();}
 function nodes(n=tree){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children??null),...nodes(n.props?.footer??null)];}
 render();return {get state(){return state;},get route(){return route;},calls,contacts,render,nodes,open(name,params){route={name,params};slots.length=0;render();},click(label){const node=nodes().find(n=>n.props?.accessibilityLabel===label);assert.ok(node,label);node.props.onPress();render();},field(label,value){nodes().find(n=>n.type==='FormField'&&n.props.label===label).props.onChangeText(value);render();}};
}
test('driver screens connect request, pickup, PIN validation, ride completion, receipt and activity',()=>{
 const app=harness();app.click('Accept demo request');assert.equal(app.route.name,'DriverJob');app.click('Advance driver trip');assert.equal(app.state.job.phase,'arrived');app.field('Verification PIN','0000');app.click('Advance driver trip');assert.equal(app.state.job.phase,'arrived');assert.ok(app.nodes().some(n=>n.props?.accessibilityRole==='alert'));app.field('Verification PIN',service.DEMO_DRIVER.pin);app.click('Advance driver trip');assert.equal(app.state.job.phase,'in_progress');app.click('Advance driver trip');app.click('Advance driver trip');assert.equal(app.route.name,'DriverCompleted');assert.equal(app.state.job.phase,'completed');app.nodes().find(n=>n.props?.title==='View trip receipt').props.onPress();assert.equal(app.route.name,'DriverTripReceipt');app.open('DriverCompleted');app.click('Finish completed driver trip');assert.equal(app.state.job,undefined);assert.equal(app.route.name,'RoleHome');
});
