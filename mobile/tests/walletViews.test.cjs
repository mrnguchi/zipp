const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

test('wallet overview opens all transactions, filters credits and debits, and returns from details',()=>{
  const slots=[];let index=0,tree;
  const transactions=[{id:'credit',kind:'deposit',amount:1000,date:100},{id:'debit',kind:'payment',amount:500,date:90},{id:'older',kind:'payment',amount:200,date:80},{id:'oldest',kind:'deposit',amount:800,date:70}];
  const colors={primary:'green',error:'red'};
  const jsx=(type,props)=>({type,props});const exports={};
  const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/WalletSheetContent.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{exports,__DEV__:false,require(name){
    if(name==='react')return {useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=value;}];}};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react-native')return {Image:Object.assign('Image',{resolveAssetSource:()=>({width:1536,height:1024})}),Pressable:'Pressable',ScrollView:'ScrollView',View:'View',StyleSheet:{create:s=>s}};
    if(name.includes('WalletContext'))return {useWallet:()=>({transactions,available:1000,balance:1000})};
    if(name.includes('ProfileContext'))return {useProfile:()=>({profile:{name:'Suh'}}),profileDisplayName:p=>p.name};
    if(name.includes('ActivityContext'))return {useActivity:()=>({records:[]})};
    if(name.includes('colors'))return {colors};
    if(name.includes('AppText'))return {AppText:'Text'};
    if(name.includes('ActionButton'))return {ActionButton:'ActionButton'};
    return {};
  }});
  function render(){index=0;tree=exports.WalletSheetContent({onTopUp(){}});}
  function all(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(all);return [node,...all(node.props?.children ?? null)];}
  function click(label){const node=all().find(n=>n.props?.accessibilityLabel===label||n.props?.children===label&&n.type==='Pressable');assert.ok(node,label);node.props.onPress();render();}
  function rows(){return all().filter(n=>n.props?.accessibilityLabel?.endsWith('transaction details'));}
  render();assert.equal(rows().length,3);
  click('View all wallet transactions');assert.equal(rows().length,4);
  all().find(n=>n.props?.accessibilityRole==='tab'&&n.props.children.props.children==='Credits').props.onPress();render();assert.equal(rows().length,2);
  rows()[0].props.onPress();render();assert.ok(all().some(n=>n.props?.children==='Credit received'));
  assert.ok(all().some(n=>n.props?.style?.some?.(style=>style?.color==='green')));
  click('Back to transactions');
  all().find(n=>n.props?.accessibilityRole==='tab'&&n.props.children.props.children==='Debits').props.onPress();render();assert.equal(rows().length,2);
  rows()[0].props.onPress();render();assert.ok(all().some(n=>n.props?.children==='Debit completed'));
  assert.ok(all().some(n=>n.props?.style?.some?.(style=>style?.color==='red')));
  click('Done viewing transaction');click('Back to wallet overview');assert.equal(rows().length,3);
});
