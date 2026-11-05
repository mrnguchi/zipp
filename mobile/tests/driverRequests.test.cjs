const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
test('offer simulation waits eight foreground seconds, stops offline/background and fires once',()=>{
 let effect,cleanup,calls=0,sequence=0;const timers=new Map(),native={currentState:'active',addEventListener(_,fn){this.listener=fn;return{remove:()=>{this.listener=null;}};}};
 const exports={};vm.runInNewContext(compile('hooks/useDriverOfferSimulation.ts'),{exports,__DEV__:true,setTimeout:(fn,delay)=>{timers.set(++sequence,{fn,delay});return sequence;},clearTimeout:id=>timers.delete(id),require:name=>name==='react'?{useRef:value=>({current:value}),useEffect:fn=>effect=fn}:{AppState:native}});
 exports.useDriverOfferSimulation(false,()=>calls++);effect();assert.equal(timers.size,0);
 exports.useDriverOfferSimulation(true,()=>calls++);cleanup=effect();assert.equal([...timers.values()][0].delay,8000);
 native.currentState='background';native.listener('background');assert.equal(timers.size,0);
 native.currentState='active';native.listener('active');const timer=[...timers.values()][0];timers.clear();timer.fn();timer.fn();assert.equal(calls,1);
 cleanup();assert.equal(native.listener,null);
 exports.useDriverOfferSimulation(true,()=>calls++);cleanup=effect();cleanup();assert.equal(timers.size,0);
});
function screenHarness(){
 const service={};vm.runInNewContext(compile('services/driverWorkspace.ts'),{exports:service});
 let state=service.driverWorkspaceReducer(service.emptyDriverWorkspace(),{type:'enable',kind:'vehicle',now:1});state=service.driverWorkspaceReducer(state,{type:'online',value:true});state=service.driverWorkspaceReducer(state,{type:'offer',id:'offer-one',now:2});
 const slots=[],navigation=[];let index=0;const jsx=(type,props)=>({type,props}),exports={};
 vm.runInNewContext(compile('screens/driver/DriverOfferScreen.tsx'),{exports,require(name){
  if(name==='react')return{useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=value];},useRef(initial){const i=index++;return slots[i]??={current:initial};}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View',ScrollView:'ScrollView',Animated:{View:'AnimatedView'},StyleSheet:{create:s=>s},useWindowDimensions:()=>({height:844,width:390})};
  if(name==='@react-navigation/native')return{useNavigation:()=>({replace:name=>navigation.push(name),goBack:()=>navigation.push('back')})};
  if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:44,bottom:34})};
  if(name.includes('DriverWorkspaceContext'))return{useDriverWorkspace:()=>({state,dispatch:action=>state=service.driverWorkspaceReducer(state,action)})};
  if(name.includes('useHomeSheet'))return{useHomeSheet:()=>({expandedHeight:720,collapsedHeight:560,travel:160,translateY:0,panHandlers:{},snap(){}})};
  if(name.includes('useRoadRoute'))return{useRoadRoute:()=>({status:'ready',route:{distanceMeters:3000,durationSeconds:360,coordinates:[]}})};
  if(name.includes('useMyLocation'))return{useMyLocation:()=>({locate(){},locating:false})};
  if(name.includes('ActionButton'))return{ActionButton:'ActionButton'};
  if(name.includes('LocalizedNative'))return{LocalizedPressable:'Pressable'};
  if(name.includes('AppText'))return{AppText:'Text'};
  if(name.includes('colors'))return{colors:{}};
  return{};
 }});
 index=0;const tree=exports.DriverOfferScreen();function nodes(node=tree){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(child=>nodes(child??null));return[node,...nodes(node.props?.children??null)];}
 return{get state(){return state;},navigation,button:label=>nodes().find(node=>node.props?.accessibilityLabel===label)};
}
test('new request screen accepts once and declines without adding trip earnings',()=>{
 const accepted=screenHarness(),accept=accepted.button('Accept driver request');assert.ok(accept);accept.props.onPress();accept.props.onPress();assert.equal(accepted.state.job.phase,'to_pickup');assert.deepEqual(accepted.navigation,['DriverJob']);
 const declined=screenHarness(),before=declined.state.history.length;declined.button('Decline driver request').props.onPress();assert.equal(declined.state.job.phase,'canceled');assert.equal(declined.state.history.length,before);assert.deepEqual(declined.navigation,['back']);
 const navigator=fs.readFileSync(`${__dirname}/../src/navigation/RootNavigator.tsx`,'utf8');assert.match(navigator, /name="DriverOffer" component=\{DriverOfferScreen\}/);
});
