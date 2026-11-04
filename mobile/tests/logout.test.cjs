const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
test('logout clears the profile and advances the session reset key',()=>{
  const slots=[];let index=0;
  const exports={};const jsx=(type,props,key)=>({type,props,key});
  vm.runInNewContext(compile('contexts/ProfileContext.tsx'),{exports,require(name){
    if(name==='react')return {createContext:()=>({Provider:'Provider'}),useCallback:fn=>fn,useMemo:fn=>fn(),useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];}};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};return {};
  }});
  function render(){index=0;return exports.ProfileProvider({children:'session'}).props.value;}
  let state=render();state.setProfile({phone:'600000000',name:'Suh'});state=render();assert.equal(state.profile.name,'Suh');
  state.logout();state=render();assert.equal(state.profile,null);assert.equal(state.sessionRevision,1);
});
test('session reset remounts private providers and initializes a new Login navigation stack',()=>{
  const exports={};let revision=0;
  const jsx=(type,props,key)=>({type,props,key});
  vm.runInNewContext(compile('App.tsx')+'\nexports.session = SessionProviders;',{exports,__DEV__:false,require(name){
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name.includes('ProfileContext'))return {useProfile:()=>({sessionRevision:revision})};
    return new Proxy({},{get:(_,property)=>String(property)});
  }});
  const before=exports.session();revision=1;const after=exports.session();assert.notEqual(before.key,after.key);
  function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
  assert.equal(nodes(after).find(node=>node.type==='RootNavigator').props.initialRouteName,'Login');
  for(const name of ['MessagingProvider','WalletProvider','ActivityProvider','BiometricProvider','ProfileSettingsProvider','NavigationContainer'])assert.ok(nodes(after).some(node=>node.type===name),name);
});
