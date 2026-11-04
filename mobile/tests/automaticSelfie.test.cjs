const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const challenge={};vm.runInNewContext(compile('services/selfieChallenge.ts'),{exports:challenge});
function harness(){
 let cursor=0,effectCursor=0,tree,now=0,starts=0,stops=0,cancels=0,recordOptions;const slots=[],effects=[],captures=[],navigation=[],listeners=[],api={};
 const jsx=(type,props)=>({type,props}),detectFaces=f=>f,stopListeners=()=>{};
 vm.runInNewContext(compile('screens/signup/AutomaticSelfieScreen.tsx'),{exports:api,Date:{now:()=>now},setInterval:()=>1,clearInterval(){},require(name){
  if(name==='react')return {useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useMemo(fn){return fn();},useEffect(fn,deps){const i=effectCursor++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j])){effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};}}};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='react-native')return {View:'View',StyleSheet:{create:s=>s,absoluteFill:{}},AppState:{currentState:'active',addEventListener(_,fn){listeners.push(fn);return {remove(){}};}},Linking:{}};
  if(name==='react-native-vision-camera')return {Camera:'Camera',useCameraDevice:()=>({}),useCameraFormat:()=>({videoWidth:480,videoHeight:640}),useCameraPermission:()=>({hasPermission:true}),useFrameProcessor:fn=>fn,runAsync:(_,fn)=>fn()};
  if(name==='react-native-vision-camera-face-detector')return {useFaceDetector:()=>({detectFaces,stopListeners})};
  if(name==='react-native-worklets-core')return {Worklets:{createRunOnJS:fn=>fn}};
  if(name==='@react-navigation/native')return {useIsFocused:()=>true,useNavigation:()=>({replace:name=>navigation.push(name)})};
  if(name.includes('DriverOnboardingContext'))return {useDriverOnboarding:()=>({setSelfie:s=>captures.push(s)})};
  if(name.includes('selfieChallenge'))return challenge;
  if(name.includes('OnboardingUI'))return {OnboardingFrame:'Frame',s:{}};
  if(name.includes('AppText'))return {AppText:'Text'};
  if(name.includes('colors'))return {colors:{}};
  return {};
 }});
 function render(){cursor=effectCursor=0;tree=api.AutomaticSelfieScreen();}
 function nodes(n=tree){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children??null),...nodes(n.props?.footer??null)];}
 const native=()=>nodes().find(n=>n.type==='Camera');render();native().props.ref.current={startRecording(options){starts++;recordOptions=options;},async stopRecording(){stops++;},async cancelRecording(){cancels++;}};native().props.onInitialized();
 // The detector reports preview coordinates; normalize with the actual layout.
 nodes().find(n=>n.props?.onLayout).props.onLayout({nativeEvent:{layout:{width:300,height:400}}});render();
 const face={bounds:{x:75,y:80,width:150,height:240},yawAngle:0,rollAngle:0,leftEyeOpenProbability:.9,rightEyeOpenProbability:.9,trackingId:1};
 return {captures,navigation,listeners,get starts(){return starts;},get stops(){return stops;},get cancels(){return cancels;},tick(patch={},ms=100){now+=ms;native()?.props.frameProcessor([{...face,...patch}]);render();},hold(ms,patch={}){for(let i=0;i<ms;i+=100)this.tick(patch);},finish(duration=9){recordOptions.onRecordingFinished({path:'/selfie.mp4',duration});},render};
}
test('native camera starts hands-free, stops after detected movements, and saves one video directly to review',()=>{
 const app=harness();app.hold(1200);assert.equal(app.starts,1);app.hold(1700);app.hold(600,{yawAngle:27});app.hold(700);app.hold(1500);app.tick({leftEyeOpenProbability:.1,rightEyeOpenProbability:.1});app.tick({},150);app.tick({leftEyeOpenProbability:.1,rightEyeOpenProbability:.1});app.tick({},150);app.hold(2000);assert.equal(app.stops,1);app.finish();assert.equal(app.captures.filter(Boolean).length,1);assert.equal(app.captures.at(-1).captureMode,'automatic');assert.equal(app.navigation[0],'DriverReview');app.finish();assert.equal(app.captures.filter(Boolean).length,1);
});
test('backgrounding cancels automatic recording and rejects a late native save callback',()=>{
 const app=harness();app.hold(1300);assert.equal(app.starts,1);app.listeners[0]('background');app.render();assert.equal(app.cancels,1);app.finish();assert.equal(app.captures.filter(Boolean).length,0);assert.equal(app.navigation.length,0);
});
