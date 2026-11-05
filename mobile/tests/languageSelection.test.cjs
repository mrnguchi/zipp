const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('the ProfileLanguage route renders the upgraded picker',()=>{
 const path=`${__dirname}/../src/screens/profile/ProfileDetailScreen.tsx`;
 const source=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let screen,route;
 function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='LanguageSettings')screen=node;if(ts.isCaseClause(node)&&node.expression.getText(source)==="'ProfileLanguage'")route=node;ts.forEachChild(node,visit);}
 visit(source);assert.ok(route?.getText(source).includes('<LanguageSettings'));assert.ok(screen?.getText(source).includes('<LanguagePicker'));
});
test('language selection highlights immediately, prevents overlapping requests and restores selection after failure',async()=>{
 const slots=[],requests=[],i18n={language:'en-US',resolvedLanguage:'en-US'};let index=0,tree;
 const jsx=(type,props)=>({type,props}),exports={};
 const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/components/LanguagePicker.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,require(name){
  if(name==='react')return {useState(initial){const key=index++;if(!(key in slots))slots[key]=initial;return[slots[key],value=>slots[key]=value];},useRef(initial){const key=index++;return slots[key]??={current:initial};}};
  if(name==='react/jsx-runtime')return{jsx,jsxs:jsx};
  if(name==='react-native')return{View:'View',ActivityIndicator:'Spinner',StyleSheet:{create:value=>value}};
  if(name==='react-i18next')return{useTranslation:()=>({i18n})};
  if(name==='../i18n')return{changeAppLanguage:language=>new Promise((resolve,reject)=>requests.push({language,resolve:()=>{i18n.resolvedLanguage=language;resolve();},reject}))};
  if(name.includes('LocalizedNative'))return{LocalizedPressable:'Pressable'};
  if(name.includes('AppText'))return{AppText:'Text'};
  if(name.includes('colors'))return{colors:{yellow:'#FEC400'}};
  return{};
 }});
 function render(){index=0;tree=exports.LanguagePicker();}
 function nodes(node=tree){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);return[node,...nodes(node.props?.children??null)];}
 const option=name=>nodes().find(node=>node.props?.accessibilityLabel===name);
 render();assert.equal(option('English').props.accessibilityState.checked,true);
 const staleEnglish=option('English');option('Français').props.onPress();staleEnglish.props.onPress();render();
 assert.equal(requests.length,1);assert.equal(option('Français').props.accessibilityState.checked,true);assert.equal(option('English').props.disabled,true);
 requests[0].resolve();await new Promise(resolve=>setImmediate(resolve));render();assert.equal(option('Français').props.accessibilityState.checked,true);assert.equal(option('English').props.disabled,false);
 option('English').props.onPress();render();assert.equal(option('English').props.accessibilityState.checked,true);
 requests[1].reject(Error('storage failed'));await new Promise(resolve=>setImmediate(resolve));render();assert.equal(option('Français').props.accessibilityState.checked,true);assert.ok(nodes().find(node=>node.props?.accessibilityRole==='alert'));
});
