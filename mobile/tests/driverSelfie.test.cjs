const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
function harness(){
  const slots=[],effects=[],listeners=[],navigation=[],captures=[];let index=0,effectIndex=0,tree,resolveVideo,recordings=0,stops=0;
  const jsx=(type,props)=>({type,props});const exports={};
  const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/screens/signup/DriverSelfieScreen.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{exports,require(name){
    if(name==='react')return {useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=index++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=effectIndex++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j])){effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};}}};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react-native')return {View:'View',Pressable:'Pressable',StyleSheet:{create:s=>s,absoluteFill:{}},AppState:{currentState:'active',addEventListener(_,fn){listeners.push(fn);return {remove(){}};}},Linking:{openSettings(){}}};
    if(name==='expo-camera')return {CameraView:'CameraView',useCameraPermissions:()=>[{granted:true},async()=>({granted:true})]};
    if(name==='@react-navigation/native')return {useIsFocused:()=>true,useNavigation:()=>({replace:name=>navigation.push(name)})};
    if(name.includes('DriverOnboardingContext'))return {useDriverOnboarding:()=>({setSelfie:value=>captures.push(value)})};
    if(name.includes('OnboardingUI'))return {OnboardingFrame:'Frame',s:{}};
    if(name.includes('ActionButton'))return {ActionButton:'ActionButton'};
    if(name.includes('AppText'))return {AppText:'Text'};
    if(name.includes('colors'))return {colors:{}};
    return {};
  }});
  function render(){index=effectIndex=0;tree=exports.GuidedSelfieCaptureScreen();}
  function nodes(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children??null),...nodes(node.props?.footer??null)];}
  render();slots[0].current={recordAsync(){recordings++;return new Promise(resolve=>resolveVideo=resolve);},stopRecording(){stops++;resolveVideo?.({uri:'file:///video.mp4'});}};
  nodes().find(n=>n.type==='CameraView').props.onCameraReady();render();
  return {render,navigation,captures,listeners,get recordings(){return recordings;},get stops(){return stops;},start(){nodes().find(n=>n.props?.accessibilityLabel==='Start selfie recording').props.onPress();render();},progress(duration){nodes().find(n=>n.type==='CameraView').props.onRecordingProgress({duration});render();},finish(){resolveVideo({uri:'file:///video.mp4'});},nodes};
}
test('full camera recording produces reviewable evidence once, without marking liveness as passed',async()=>{
  const app=harness();const start=app.nodes().find(n=>n.props?.accessibilityLabel==='Start selfie recording').props.onPress;start();start();app.render();assert.equal(app.recordings,1);app.progress(8.5);app.finish();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.navigation[0],'DriverSelfieReview');assert.equal(app.captures.at(-1).durationSeconds,8.5);assert.equal(app.captures.at(-1).verified,undefined);
});
test('backgrounding cancels the recording and never saves interrupted evidence',async()=>{
  const app=harness();app.start();app.progress(4);app.listeners[0]('background');app.render();await new Promise(resolve=>setImmediate(resolve));
  assert.ok(app.stops>0);assert.equal(app.navigation.length,0);assert.ok(!app.captures.some(Boolean));assert.ok(!app.nodes().some(n=>n.type==='CameraView'));
});
test('a short video cannot advance to review',async()=>{
  const app=harness();app.start();app.progress(2);app.finish();await new Promise(resolve=>setImmediate(resolve));app.render();assert.equal(app.navigation.length,0);assert.ok(!app.captures.some(Boolean));assert.ok(app.nodes().some(n=>n.props?.accessibilityRole==='alert'));
});
