const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const service={};vm.runInNewContext(compile('services/driverWorkspace.ts'),{exports:service});
 let state=service.driverWorkspaceReducer(service.emptyDriverWorkspace(),{type:'enable',kind:'vehicle',now:1});for(const action of [{type:'online',value:true},{type:'offer',id:'new-ride',now:2},{type:'accept'}])state=service.driverWorkspaceReducer(state,action);
 const slots=[],effects=[],queued=[],navigation=[],conversations=[],snaps=[];let index=0,effectIndex=0,tree,dirty;
 const jsx=(type,props)=>({type,props}),exports={};
 vm.runInNewContext(compile('screens/driver/DriverRideScreen.tsx'),{exports,require(name){
  if(name==='react')return{useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{dirty||=slots[i]!==value;slots[i]=value;}];},useRef(initial){const i=index++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=effectIndex++,previous=effects[i];if(!previous||deps.some((value,j)=>value!==previous.deps[j]))queued.push(()=>{previous?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View',Keyboard:{dismiss(){},addListener(){return{remove(){}};}},Animated:{View:'AnimatedView'},StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:390,height:844}),Platform:{OS:'ios'}};
  if(name==='@react-navigation/native')return{useNavigation:()=>({navigate:(name,params)=>navigation.push({name,params}),replace:name=>navigation.push({name})})};
  if(name==='react-native-safe-area-context')return{useSafeAreaInsets:()=>({top:44,bottom:34})};
  if(name.includes('DriverWorkspaceContext'))return{useDriverWorkspace:()=>({state,dispatch:action=>{state=service.driverWorkspaceReducer(state,action);}})};
  if(name.includes('MessagingContext'))return{useMessaging:()=>({ensureConversation:conversation=>conversations.push(conversation)})};
  if(name.includes('driverWorkspace'))return service;
  if(name.includes('useHomeSheet'))return{useHomeSheet:()=>({expandedHeight:720,collapsedHeight:480,travel:240,translateY:0,panHandlers:{},snap:value=>snaps.push(value)})};
  if(name.includes('useMyLocation'))return{useMyLocation:()=>({locate(){},locating:false})};
  if(name.includes('useRoadRoute'))return{useRoadRoute:()=>({status:'ready',route:{coordinates:[],distanceMeters:3000,durationSeconds:360}})};
  if(name.includes('sampleDriverLocation'))return{sampleDriverLocation:point=>point};
  if(name.includes('LocalizedNative'))return{LocalizedPressable:'Pressable'};
  if(name.includes('OtpInput'))return{OtpInput:'OtpInput'};
  if(name.includes('ActionButton'))return{ActionButton:'ActionButton'};
  if(name.includes('AppText'))return{AppText:'Text'};
  if(name.includes('colors'))return{colors:{}};
  return{};
 }});
 function render(){let passes=0;do{dirty=false;index=effectIndex=0;tree=exports.DriverRideScreen();while(queued.length)queued.shift()();if(++passes>8)throw Error('render loop');}while(dirty);}
 function nodes(node=tree){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(child=>nodes(child??null));return[node,...nodes(node.props?.children??null)];}
 const button=label=>nodes().find(node=>node.props?.accessibilityLabel===label);
 render();return{get state(){return state;},service,navigation,conversations,snaps,render,button,nodes,click(label){const b=button(label);assert.ok(b,label);assert.ok(!b.props.disabled,label+' enabled');b.props.onPress();render();},pin(value){nodes().find(node=>node.type==='OtpInput').props.onChange(value);render();}};
}
test('new ride screen verifies PIN, rejects stale taps and credits a completed trip once',()=>{
 const app=harness(),initial=app.service.driverBalance(app.state);
 const stale=app.button('Advance driver trip').props.onPress;app.click('Advance driver trip');assert.equal(app.state.job.phase,'arrived');stale();assert.equal(app.state.job.phase,'arrived');
 assert.equal(app.button('Advance driver trip').props.disabled,true);assert.equal(app.snaps.at(-1),true);
 app.pin('0000');app.click('Advance driver trip');assert.equal(app.state.job.phase,'arrived');assert.ok(app.nodes().some(node=>node.props?.accessibilityRole==='alert'));
 app.pin('4826');app.click('Advance driver trip');assert.equal(app.state.job.phase,'in_progress');assert.equal(app.snaps.at(-1),false);
 const oldAdvance=app.button('Advance driver trip').props.onPress;app.click('Advance driver trip');assert.equal(app.state.job.phase,'at_dropoff');oldAdvance();assert.equal(app.state.job.phase,'at_dropoff');
 app.click('Advance driver trip');assert.equal(app.state.job.phase,'completed');assert.equal(app.service.driverBalance(app.state),initial+2250);assert.equal(app.navigation.at(-1).name,'DriverCompleted');
});
test('ride contact actions open the assigned rider conversation and route uses the new screen',()=>{
 const app=harness();app.click('Message customer');assert.equal(app.navigation.at(-1).name,'Conversation');assert.equal(app.conversations[0].id,'driver-customer-new-ride');
 app.click('Call customer');assert.equal(app.navigation.at(-1).name,'Call');
 const navigator=fs.readFileSync(`${__dirname}/../src/navigation/RootNavigator.tsx`,'utf8');assert.match(navigator,/name="DriverJob" component=\{DriverRideScreen\}/);
});
