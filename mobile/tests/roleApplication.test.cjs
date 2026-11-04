const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=file=>ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const service={};vm.runInNewContext(compile('services/driverOnboarding.ts'),{exports:service});
const routing={};vm.runInNewContext(compile('services/roleApplication.ts'),{exports:routing,require:()=>service});
test('applications resume at the first incomplete step and preserve review states',()=>{
 const app=service.emptyDriverApplication();assert.equal(routing.applicationDestination(app),'DriverType');app.kind='bike';assert.equal(routing.applicationDestination(app),'DriverDetails');
 Object.assign(app,{fullName:'Test',phone:'699000000',city:'Buea'});assert.equal(routing.applicationDestination(app),'DriverVehicle');
 Object.assign(app,{make:'Honda',model:'125',plate:'SW123',color:'Black',condition:'good'});assert.equal(routing.applicationDestination(app),'DriverDocuments');
 for(const doc of service.driverDocuments)app.documents[doc.key]={uri:'file:///id.jpg',name:'id.jpg',mimeType:'image/jpeg'};
 assert.equal(routing.applicationDestination(app),'DriverSelfieIntro');app.selfie={uri:'file:///selfie.mp4',durationSeconds:9};assert.equal(routing.applicationDestination(app),'DriverReview');
 for(const status of ['draft_saved','pending','approved','needs_changes']){app.status=status;assert.equal(routing.applicationDestination(app),'DriverVerificationStatus');}
});
function harness(role,{application=service.emptyDriverApplication(),job,records=[]}={}){
 const api={},calls=[],profile={phone:'699000000',name:'Bertrand Suh'},jsx=(type,props)=>({type,props});
 vm.runInNewContext(compile('screens/signup/RoleApplicationScreen.tsx'),{exports:api,require(name){
  if(name==='react')return {useState:initial=>[typeof initial==='boolean'?true:initial,()=>{}]};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='react-native')return {Image:'Image',View:'View'};
  if(name==='@expo/vector-icons')return {Ionicons:'Icon'};
  if(name.includes('DriverOnboardingContext'))return {useDriverOnboarding:()=>({application,chooseKind:kind=>calls.push(['kind',kind]),update:patch=>calls.push(['update',patch])})};
  if(name.includes('DriverWorkspaceContext'))return {useDriverWorkspace:()=>({state:{job}})};
  if(name.includes('ActivityContext'))return {useActivity:()=>({records})};
  if(name.includes('ProfileContext'))return {useProfile:()=>({profile})};
  if(name.includes('roleApplication'))return routing;
  if(name.includes('driverWorkspace'))return {activeDriverJob:job=>!!job&&job.phase==='in_progress'};
  if(name.includes('OnboardingUI'))return {OnboardingFrame:'Frame',s:{}};
  if(name.includes('RoleGuideDesign'))return {RoleGuideArtwork:'Artwork',g:{}};
  if(name.includes('colors'))return {colors:{}};
  if(name.includes('ActionButton'))return {ActionButton:'Button'};
  if(name.includes('AppText'))return {AppText:'Text'};
  if(name.includes('LocalizedNative'))return {LocalizedPressable:'Pressable'};
  if(name.endsWith('.png'))return 1;
  throw Error(name);
 }});
 const navigation={navigate:(...args)=>calls.push(args)};
 function pressFooter(name){const tree=api.RoleApplicationScreen({route:{name,params:{role}},navigation});const footer=tree.props.footer;const nodes=Array.isArray(footer.props?.children)?footer.props.children:[footer];nodes.find(node=>node?.type==='Button').props.onPress();}
 return {calls,pressFooter};
}
test('driver and delivery rider guides connect requirements and prepare the correct transport on the same account',()=>{
 for(const [role,kind]of [['driver','vehicle'],['rider','bike']]){const h=harness(role);h.pressFooter('RoleRequirements');assert.equal(h.calls[0][1],kind);assert.equal(h.calls[1][1].phone,'699000000');assert.equal(h.calls[2][0],'DriverDetails');}
});
test('existing applications retain their evidence and active trips block enrollment navigation',()=>{
 const application={...service.emptyDriverApplication(),kind:'vehicle',status:'draft_saved',documents:{identity_front:{uri:'file:///id.jpg'}}};
 const h=harness('rider',{application});h.pressFooter('RoleRequirements');assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'DriverVerificationStatus');assert.ok(application.documents.identity_front);
 for(const options of [{job:{phase:'in_progress'}},{records:[{status:'active'}]}]){const blocked=harness('driver',options);blocked.pressFooter('RoleRequirements');assert.equal(blocked.calls.length,0);}
});
