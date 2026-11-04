const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const read=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const service={};vm.runInNewContext(compile(read('services/driverOnboarding.ts')),{exports:service});
function completeApplication(){const app={...service.emptyDriverApplication(),kind:'vehicle',fullName:'Test Driver',phone:'600000000',city:'Buea',make:'Toyota',model:'Yaris',plate:'SW 681 BS',color:'White',condition:'good',selfie:{uri:'file:///selfie.mp4',durationSeconds:9,capturedAt:Date.now()}};for(const item of service.driverDocuments)app.documents[item.key]={uri:`file:///${item.key}.jpg`,name:`${item.key}.jpg`,mimeType:'image/jpeg',size:1000};return app;}
test('driver review requires transport, personal details, documents, and a full selfie video',()=>{
  assert.ok(service.applicationProblem(service.emptyDriverApplication(),'review'));
  const app=completeApplication();assert.equal(service.applicationProblem(app,'review'),undefined);
  app.documents.identity_back=undefined;assert.ok(service.applicationProblem(app,'review'));
  assert.equal(service.applicationProblem(app,'vehicle'),undefined);
  app.documents=completeApplication().documents;app.selfie.durationSeconds=2;assert.ok(service.applicationProblem(app,'review'));
  app.selfie=undefined;assert.ok(service.applicationProblem(app,'selfie'));
});
test('document attachments reject remote URLs, unsupported files, and oversized payloads',()=>{
  const good={uri:'file:///document.pdf',name:'document.pdf',mimeType:'application/pdf',size:1000};
  assert.equal(service.documentProblem(good),undefined);
  for(const file of [{...good,uri:'https://example.com/document.pdf'},{...good,mimeType:'application/javascript'},{...good,size:16*1024*1024},{...good,size:0}])assert.ok(service.documentProblem(file));
});
test('condition is required and suggests the corresponding category without approving the vehicle',()=>{
 const app=completeApplication();delete app.condition;assert.ok(service.applicationProblem(app,'vehicle'));
 for(const [condition,category]of [['good','Everyday'],['excellent','Comfort'],['premium','Premium']]){app.condition=condition;assert.equal(service.suggestedVehicleCategory(app),category);assert.equal(service.applicationProblem(app,'vehicle'),undefined);assert.equal(app.status,'draft');}
 app.kind='bike';delete app.condition;assert.equal(service.suggestedVehicleCategory(app),'Delivery');assert.equal(service.applicationProblem(app,'vehicle'),undefined);assert.equal(service.applicationProblem(app,'review'),undefined);
});
test('saving is a local draft, and changing transport clears vehicle evidence',()=>{
  let index=0,ownerPhone='600000000';const slots=[],exports={};const jsx=(type,props)=>({type,props});
  vm.runInNewContext(compile(read('contexts/DriverOnboardingContext.tsx')),{exports,require(name){
    if(name==='react')return {createContext:()=>({Provider:'Provider'}),useCallback:fn=>fn,useRef(initial){const i=index++;return slots[i]??={current:initial};},useEffect:fn=>fn(),useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];}};
    if(name.includes('ProfileContext'))return {useProfile:()=>({profile:{phone:ownerPhone}})};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name.includes('driverOnboarding'))return service;return {};
  }});
  const render=()=>{index=0;return exports.DriverOnboardingProvider({children:null}).props.value;};
  let state=render();assert.ok(state.saveDraft());slots[0]=completeApplication();state=render();assert.equal(state.saveDraft(),undefined);state=render();assert.equal(state.application.status,'draft_saved');assert.ok(state.application.savedAt);assert.notEqual(state.application.status,'approved');
  state.chooseKind('bike');state=render();assert.equal(state.application.kind,'bike');assert.equal(state.application.fullName,'Test Driver');assert.equal(Object.keys(state.application.documents).length,0);assert.equal(state.application.selfie,undefined);assert.equal(state.application.status,'draft');
  ownerPhone='611111111';render();state=render();assert.equal(state.application.fullName,'');assert.equal(state.application.kind,null);
});
test('signup role routing opens driver transport choices or the rider welcome',()=>{
  const source=ts.createSourceFile('SelectRoleScreen.tsx',read('screens/SelectRoleScreen.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
  function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='continueToHome')callback=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);
  function proceed(selectedRole){const calls=[];vm.runInNewContext(`(${callback})()`,{selectedRole,selectRole:role=>calls.push(['role',role]),navigation:{navigate:(name,params)=>calls.push([name,params])}});return calls;}
  assert.equal(proceed(null).length,0);assert.equal(proceed('driver')[0][0],'DriverType');assert.equal(proceed('rider')[1][0],'SignupWelcome');
});
