const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness({platform='android',inputY=450,inputHeight=50,viewportBottom=500,keyboardY=600}={}){
 const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/components/KeyboardAwareScrollView.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const api={},refs=[],timers=new Map(),listeners={},moves=[];let cleanup,index=0,sequence=0,focus;
 const input={measureInWindow:fn=>fn(0,inputY,300,inputHeight)};focus=input;
 const native={measureInWindow:fn=>fn(0,100,300,viewportBottom-100),scrollTo:args=>moves.push(args)};
 vm.runInNewContext(code,{exports:api,setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id),require(name){
  if(name==='react')return {forwardRef:fn=>props=>fn(props,null),useCallback:fn=>fn,useRef:initial=>{const value={current:index++===0?native:initial};refs.push(value);return value;},useImperativeHandle:()=>{},useEffect:fn=>{cleanup=fn();}};
  if(name==='react-native')return {ScrollView:'ScrollView',Platform:{OS:platform},TextInput:{State:{currentlyFocusedInput:()=>focus}},Keyboard:{metrics:()=>({screenY:keyboardY}),addListener:(name,fn)=>{listeners[name]=fn;return {remove:()=>delete listeners[name]};}}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props})};throw Error(name);
 }});
 const callbacks=[];const tree=api.KeyboardAwareScrollView({onFocus:()=>callbacks.push('focus'),onScroll:()=>callbacks.push('scroll')});
 return {tree,moves,callbacks,listeners,cleanup:()=>cleanup(),blurFocus:()=>{focus=null;},flush(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());}};
}
test('Android fields scroll above the actual viewport/footer and preserve consumer callbacks',()=>{
 const h=harness();h.tree.props.onScroll({nativeEvent:{contentOffset:{y:100}}});h.tree.props.onFocus({});h.flush();assert.equal(h.moves[0].y,120);assert.deepEqual(h.callbacks,['scroll','focus']);assert.equal(h.tree.props.keyboardShouldPersistTaps,'handled');
 const keyboard=harness({viewportBottom:800,keyboardY:500,inputY:470});keyboard.tree.props.onFocus({});keyboard.flush();assert.equal(keyboard.moves[0].y,40);
});
test('visible fields and iOS do not receive Android scroll adjustments',()=>{
 for(const options of [{inputY:200},{platform:'ios'}]){const h=harness(options);h.tree.props.onFocus({});h.flush();assert.equal(h.moves.length,0);}
});
test('keyboard resize reveals the current field and ignores stale focus or unmounted screens',()=>{
 const h=harness();h.tree.props.onFocus({});h.listeners.keyboardDidShow();h.flush();assert.equal(h.moves.length,1);h.tree.props.onLayout({});h.blurFocus();h.flush();assert.equal(h.moves.length,1);h.tree.props.onLayout({});h.cleanup();h.flush();assert.equal(h.moves.length,1);assert.equal(h.listeners.keyboardDidShow,undefined);
});
