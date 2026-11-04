const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
test('fields expose focus and blur validation, clear errors while correcting, and preserve callbacks',()=>{
  let index=0,tree,focused=0,blurred=0;
  const slots=[],exports={};const jsx=(type,props)=>({type,props});
  vm.runInNewContext(ts.transpileModule(read('components/FormField.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require(name){
    if(name==='react')return {useState(initial){const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>slots[i]=v];}};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react-native')return {View:'View',TextInput:'TextInput',StyleSheet:{create:s=>s}};
    if(name.includes('AppText'))return {AppText:'Text'};
    if(name.includes('LocalizedNative'))return {LocalizedTextInput:'TextInput',LocalizedPressable:'Pressable'};
    if(name.includes('colors'))return {colors:{primaryDark:'#087948',error:'#B42318'}};
    return {};
  }});
  const props={label:'Phone',value:'bad',validate:value=>value==='bad'?'Enter a valid phone.':undefined,onFocus(){focused++;},onBlur(){blurred++;}};
  function render(){index=0;tree=exports.FormField(props);}
  function nodes(node=tree){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children??null)];}
  const input=()=>nodes().find(node=>node.type==='TextInput');
  render();assert.ok(!nodes().some(node=>node.props?.accessibilityRole==='alert'));
  input().props.onFocus({});render();assert.equal(focused,1);assert.ok(input().props.style.some(s=>s?.backgroundColor==='#E8EAEE'));
  input().props.onBlur({});render();assert.equal(blurred,1);assert.equal(input().props.accessibilityHint,'Enter a valid phone.');assert.ok(nodes().some(node=>node.props?.accessibilityRole==='alert'));
  input().props.onFocus({});render();assert.ok(!nodes().some(node=>node.props?.accessibilityRole==='alert'));
  props.value='612345678';input().props.onBlur({});render();assert.ok(!nodes().some(node=>node.props?.accessibilityRole==='alert'));
  props.editable=false;render();assert.equal(input().props.accessibilityState.disabled,true);
});
test('primary button text and shared body text meet AA normal-text contrast',()=>{
  const exports={};vm.runInNewContext(ts.transpileModule(read('constants/colors.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
  const c=exports.colors;
  function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  assert.ok(contrast(c.white,c.primaryDark)>=4.5);
  assert.ok(contrast(c.secondaryText,c.input)>=4.5);
  assert.match(read('components/ActionButton.tsx'),/backgroundColor: colors\.primaryDark/);
});
