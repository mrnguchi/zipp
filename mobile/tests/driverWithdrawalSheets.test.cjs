const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(){
 const service={};vm.runInNewContext(compile('src/services/driverWorkspace.ts'),{exports:service,require:()=>({})});
 let state=service.driverWorkspaceReducer(service.emptyDriverWorkspace(),{type:'enable'});
 // Use the service's fixture-independent history so the available balance is deterministic.
 state={...state,enabled:true,history:[{id:'earned',kind:'ride',phase:'completed',fare:10000,fee:1000,createdAt:1}],payouts:[]};
 let slots=[],index=0,tree,timer;const actions=[],screen={};
 const jsx=(type,props)=>({type,props});
 const dispatch=action=>{actions.push(action);state=service.driverWorkspaceReducer(state,action);};
 const mocks={
  react:{useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=v];},useRef(initial){const i=index++;return slots[i]??={current:initial};},useEffect(fn){fn();}},
  'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Image:'Image',ScrollView:'ScrollView',Modal:'Modal',ActivityIndicator:'Spinner',Keyboard:{dismiss(){}},Share:{share:async()=>{}},StyleSheet:{create:s=>s,absoluteFill:{}}},
  '@react-navigation/native':{useRoute:()=>({params:undefined}),useNavigation:()=>({goBack(){}})},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:34})}
 };
 vm.runInNewContext(compile('src/screens/driver/DriverWithdrawScreen.tsx'),{exports:screen,__DEV__:true,setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){},require:name=>mocks[name]|| (name.includes('DriverWorkspaceContext')?{useDriverWorkspace:()=>({state,dispatch})}:name.includes('ProfileContext')?{useProfile:()=>({profile:{phone:'699000001'}})}:name.includes('driverWorkspace')?service:name.includes('DriverUI')?{DriverPage:'Page',driverMoney:n=>`${n} XAF`}:name.includes('AppText')?{AppText:'Text'}:name.includes('LocalizedNative')?{LocalizedPressable:'Pressable'}:name.includes('ActionButton')?{ActionButton:'Button'}:name.includes('FormField')?{FormField:'Field'}:name.includes('colors')?{colors:{}}:{} )});
 const render=()=>{index=0;tree=screen.DriverWithdrawScreen();};
 function nodes(n=tree){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x));return [n,...nodes(n.props?.children??null),...nodes(n.props?.footer??null)];}
 render();return {actions,get state(){return state;},nodes,render,click(label){const node=nodes().find(n=>n.props?.accessibilityLabel===label);assert.ok(node,label);node.props.onPress();render();},amount(value){nodes().find(n=>n.type==='Field'&&n.props.label==='Amount (XAF)').props.onChangeText(value);render();},finish(){timer();render();}};
}
test('withdrawal reviews and settles in sheets without navigating; repeated confirm reserves once',()=>{
 const app=harness();app.amount('2000');app.click('Review withdrawal');assert.ok(app.nodes().some(n=>n.type==='Modal'&&n.props.visible));
 const confirm=app.nodes().find(n=>n.props?.accessibilityLabel==='Confirm withdrawal').props.onPress;confirm();confirm();app.render();
 assert.equal(app.state.payouts.length,1);assert.equal(app.state.payouts[0].status,'processing');app.finish();assert.equal(app.state.payouts[0].status,'paid');assert.equal(app.actions.filter(a=>a.type==='payout').length,1);
});
test('invalid or excessive withdrawal never opens review or reserves earnings',()=>{
 const app=harness();app.amount('20000');app.click('Review withdrawal');assert.equal(app.state.payouts.length,0);assert.ok(!app.nodes().some(n=>n.type==='Modal'&&n.props.visible));
});
