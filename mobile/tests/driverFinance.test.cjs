const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=f=>ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${f}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const service={},ledger={};vm.runInNewContext(compile('services/driverWorkspace.ts'),{exports:service});vm.runInNewContext(compile('services/walletLedger.ts'),{exports:ledger});
function harness(dev=true){
 let state=service.driverWorkspaceReducer(service.emptyDriverWorkspace(),{type:'enable',kind:'vehicle',now:Date.now()}),wallet={balance:25500,holds:{},settled:{},deposits:[]},transactions=[],route={name:'DriverEarnings'},index=0,tree,moneyValue;let slots=[];const moneySlots=[],pages=new Map(),moneyApi={},finance={},activity={},shares=[];const jsx=(type,props)=>({type,props});
 const navigation={navigate(name,params){pages.delete(name);route={name,params};},replace(name,params){pages.delete(name);route={name,params};},popTo(name,params){route={name,params};},reset({routes,index}){route=routes[index];},goBack(){route={name:'DriverEarnings'};}};
 function walletValue(){return {available:ledger.availableBalance(wallet),transactions,simulateDeposit(id,amount){if(!dev)return false;const next=ledger.updateWallet(wallet,{type:'deposit',id,amount});if(next===wallet)return false;wallet=next;transactions.unshift({id,kind:'deposit',amount,date:Date.now()});return true;}};}
 const react={createContext:()=>({Provider:'Provider'}),useCallback:fn=>fn,useState(initial){const memory=slots,i=index++;if(!(i in memory))memory[i]=typeof initial==='function'?initial():initial;return [memory[i],v=>memory[i]=typeof v==='function'?v(memory[i]):v];},useRef(initial){const memory=slots,i=index++;return memory[i]??={current:initial};}};
 function requireMock(name){
  if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='react-native')return {View:'View',Image:'Image',StyleSheet:{create:s=>s},Share:{share:async value=>{shares.push(value);return {};}}};
  if(name==='@react-navigation/native')return {useRoute:()=>route,useNavigation:()=>navigation};
  if(name==='react-i18next')return {useTranslation:()=>({i18n:{resolvedLanguage:'en'}})};
  if(name.includes('WalletContext'))return {useWallet:walletValue};
  if(name.includes('DriverWorkspaceContext'))return {useDriverWorkspace:()=>({state,dispatch:action=>{state=service.driverWorkspaceReducer(state,action);}})};
  if(name.includes('DriverMoneyContext'))return {useDriverMoney:()=>moneyValue,topUpProblem:moneyApi.topUpProblem};
  if(name.includes('ProfileContext'))return {useProfile:()=>({profile:{name:'Bertrand Suh',phone:'699000001'}}),profileDisplayName:()=> 'Suh'};
  if(name.includes('driverWorkspace'))return service;
  if(name.includes('DriverUI'))return {DriverPage:'Frame',DriverSection:'Section',DriverInfo:'Info',DriverEmpty:'Empty',DriverStatusPill:'Pill',MoneyOutcome:'Outcome',driverMoney:n=>`${n} XAF`,driverDate:n=>String(n),u:{}};
  if(name.includes('useRoadRoute'))return {useRoadRoute:()=>({status:'ready',route:{coordinates:[]}})};
  if(name.includes('ActionButton'))return {ActionButton:'ActionButton'};if(name.includes('FormField'))return {FormField:'FormField'};if(name.includes('AppText'))return {AppText:'Text'};
  if(name.includes('LocalizedNative'))return {LocalizedPressable:'Pressable',LocalizedTextInput:'TextInput'};
  if(name.includes('theme'))return {theme:{typography:{regular:'Poppins'}}};
  if(name.includes('colors'))return {colors:{}};return {};
 }
 for(const [file,exports]of [['contexts/DriverMoneyContext.tsx',moneyApi],['screens/driver/DriverFinanceScreen.tsx',finance],['screens/driver/DriverActivityScreen.tsx',activity]])vm.runInNewContext(compile(file),{exports,__DEV__:dev,require:requireMock});
 function render(){slots=moneySlots;index=0;moneyValue=moneyApi.DriverMoneyProvider({children:null}).props.value;slots=pages.get(route.name)||[];pages.set(route.name,slots);index=0;tree=route.name==='RoleHome'?{type:'RoleHome',props:{}}:route.name==='DriverTripReceipt'?activity.DriverTripDetailScreen():route.name==='DriverTripHistory'?activity.DriverActivityScreen():finance.DriverFinanceScreen();}
 function nodes(n=tree){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(nodes);return [n,...nodes(n.props?.children??null),...nodes(n.props?.footer??null)];}
 render();return {get state(){return state;},get wallet(){return wallet;},get requests(){return moneyValue.requests;},get transactions(){return transactions;},get route(){return route;},shares,nodes,render,open(name,params){route={name,params};pages.delete(name);render();},click(label){const n=nodes().find(n=>n.props?.accessibilityLabel===label);assert.ok(n,label);n.props.onPress();render();},field(label,value){const n=nodes().find(n=>n.type==='FormField'&&n.props.label===label);assert.ok(n,label);n.props.onChangeText(value);render();}};
}
test('withdrawal form, review and failure screens reserve and release earnings without duplicate requests',()=>{
 const app=harness(),before=service.driverBalance(app.state);app.open('DriverPayout');app.field('Amount (XAF)','1000');app.click('Review withdrawal');assert.equal(app.route.name,'DriverPayoutReview');const confirm=app.nodes().find(n=>n.props?.accessibilityLabel==='Confirm withdrawal').props.onPress;confirm();confirm();app.render();assert.equal(app.state.payouts.length,1);assert.equal(service.driverBalance(app.state),before-1000);assert.equal(app.route.name,'DriverPayoutStatus');app.click('Simulate failed payout');assert.equal(service.driverBalance(app.state),before);assert.ok(app.nodes().some(n=>n.type==='Outcome'&&n.props.title==='Withdrawal unsuccessful'));assert.ok(app.nodes().some(n=>n.props?.accessibilityLabel==='Retry demo payout'));
});
test('withdrawal cancellation releases its hold once and a stale success action cannot debit again',()=>{
 const app=harness(),before=service.driverBalance(app.state);app.open('DriverPayout');app.field('Amount (XAF)','1500');app.click('Review withdrawal');app.click('Confirm withdrawal');const late=app.nodes().find(n=>n.props?.accessibilityLabel==='Simulate successful payout').props.onPress;app.click('Cancel withdrawal');late();app.render();assert.equal(service.driverBalance(app.state),before);assert.equal(app.state.payouts[0].status,'canceled');
});
test('top-up credits the shared wallet once only after confirmation, and never adds withdrawable earnings',()=>{
 const app=harness(),earned=service.driverBalance(app.state),balance=app.wallet.balance;app.open('DriverTopUp');app.field('Amount (XAF)','2000');app.click('Review wallet top-up');app.click('Confirm wallet top-up');assert.equal(app.route.name,'DriverTopUpStatus');assert.equal(app.wallet.balance,balance);const confirm=app.nodes().find(n=>n.props?.accessibilityLabel==='Simulate top-up success').props.onPress;confirm();confirm();app.render();assert.equal(app.wallet.balance,balance+2000);assert.equal(app.transactions.length,1);assert.equal(app.requests[0].status,'completed');assert.equal(service.driverBalance(app.state),earned);assert.ok(app.nodes().some(n=>n.type==='Outcome'&&n.props.title==='Wallet topped up'));
});
test('failed or canceled top-ups do not credit funds and release builds cannot create a simulated request',()=>{
 for(const label of ['Simulate top-up failure','Cancel top-up']){const app=harness();app.open('DriverTopUp');app.field('Amount (XAF)','2000');app.click('Review wallet top-up');app.click('Confirm wallet top-up');app.click(label);assert.equal(app.wallet.balance,25500);assert.equal(app.transactions.length,0);assert.ok(['failed','canceled'].includes(app.requests[0].status));}
 const live=harness(false);live.open('DriverTopUp');live.field('Amount (XAF)','2000');live.click('Review wallet top-up');live.click('Confirm wallet top-up');assert.equal(live.route.name,'DriverTopUpReview');assert.equal(live.requests.length,0);assert.equal(live.wallet.balance,25500);assert.ok(live.nodes().some(n=>n.props?.accessibilityRole==='alert'));
});
test('activity searches real history and opens its route, fare breakdown and shareable receipt',()=>{
 const app=harness();app.open('DriverTripHistory');assert.equal(app.nodes().filter(n=>n.props?.accessibilityLabel?.startsWith('View trip with')).length,3);app.nodes().find(n=>n.props?.accessibilityLabel==='Search driver trips').props.onChangeText('Marie');app.render();assert.equal(app.nodes().filter(n=>n.props?.accessibilityLabel?.startsWith('View trip with')).length,1);app.click('View trip with Marie E.');assert.equal(app.route.name,'DriverTripReceipt');assert.ok(app.nodes().some(n=>n.type==='Info'&&n.props.rows.some(row=>row[0]==='Your earnings')));app.click('Share demo trip receipt');assert.equal(app.shares.length,1);
});
test('failed top-ups retry with saved details, create a new request, and credit only the successful attempt',()=>{
 const app=harness();app.open('DriverTopUp');app.field('Amount (XAF)','2000');app.click('Review wallet top-up');app.click('Confirm wallet top-up');const first=app.route.params.id;app.click('Simulate top-up failure');app.click('Retry wallet top-up');assert.equal(app.route.name,'DriverTopUp');assert.equal(app.nodes().find(n=>n.type==='FormField'&&n.props.label==='Amount (XAF)').props.value,'2000');app.click('Review wallet top-up');app.click('Confirm wallet top-up');assert.notEqual(app.route.params.id,first);assert.equal(app.requests.length,2);app.click('Simulate top-up success');assert.equal(app.wallet.balance,27500);assert.equal(app.transactions.length,1);app.click('Back to driver wallet');assert.equal(app.route.name,'DriverWallet');
});
test('successful withdrawals keep wallet funds separate and return to Earnings in the main navigation',()=>{
 const app=harness(),before=service.driverBalance(app.state);app.open('DriverPayout');app.field('Amount (XAF)','1000');app.click('Review withdrawal');app.click('Confirm withdrawal');app.click('Simulate successful payout');assert.equal(service.driverBalance(app.state),before-1000);assert.equal(app.wallet.balance,25500);app.click('Back to driver earnings');assert.equal(app.route.name,'RoleHome');assert.equal(app.route.params.driverTab,'Earnings');
});
