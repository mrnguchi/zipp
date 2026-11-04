const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

test('referral screens navigate and open native sharing without creating rewards or claiming delivery',async()=>{
  let page='ReferAndEarn',index=0,tree,shareCount=0,resolveShare;
  const slots=[],visited=[];
  const jsx=(type,props)=>({type,props});const exports={};
  const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/screens/profile/ReferralScreen.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{exports,process:{env:{}},require(name){
    if(name==='react')return {useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v];},useRef(initial){const i=index++;return slots[i]??={current:initial};}};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react-native')return {View:'View',Pressable:'Pressable',StyleSheet:{create:s=>s},Share:{share(payload){shareCount++;assert.ok(payload.message.includes('Join me on Zipp'));return new Promise(resolve=>{resolveShare=resolve;});}}};
    if(name==='@react-navigation/native')return {useRoute:()=>({name:page}),useNavigation:()=>({navigate(name){visited.push(name);page=name;}})};
    if(name.includes('ProfileDetailScreen'))return {ProfileFrame:'ProfileFrame'};
    if(name.includes('ActionButton'))return {ActionButton:'ActionButton'};
    if(name.includes('AppText'))return {AppText:'Text'};
    if(name.includes('colors'))return {colors:{}};
    return {};
  }});
  function render(){index=0;tree=exports.ReferralScreen();}
  function nodes(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children??null)];}
  render();nodes().find(n=>n.props?.accessibilityLabel==='Invite friends to Zipp').props.onPress();render();assert.equal(page,'ReferralInvite');
  const share=nodes().find(n=>n.props?.accessibilityLabel==='Share Zipp invitation');
  share.props.onPress();share.props.onPress();assert.equal(shareCount,1);
  resolveShare({action:'dismissedAction'});await new Promise(resolve=>setImmediate(resolve));render();assert.equal(nodes().find(n=>n.props?.accessibilityLabel==='Share Zipp invitation').props.disabled,false);
  for(const name of ['ReferralHowItWorks','ReferralRewards','ReferralTerms']){page=name;render();assert.ok(tree.props.title);}
  page='ReferralRewards';render();assert.ok(nodes().some(n=>n.props?.children==='No referral credits recorded'));
  assert.equal(visited[0],'ReferralInvite');
});
