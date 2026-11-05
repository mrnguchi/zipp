const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/services/passwordRecovery.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api});
test('password reset validates the phone and requires a verified single-use code before completion',()=>{
 const flow=api.createPasswordRecovery(true,()=>1000);
 assert.equal(api.normalizeRecoveryPhone('(+237) 612 345 678'),'+237612345678');
 assert.equal(api.normalizeRecoveryPhone('1234'),null);
 assert.throws(()=>flow.complete('new-password','new-password'),/Verify/);
 flow.request('612345678');assert.throws(()=>flow.verify('654321'),/incorrect/);
 flow.verify('123456');assert.throws(()=>flow.complete('short','short'),/8 characters/);
 assert.throws(()=>flow.complete('new-password','other-password'),/match/);
 assert.equal(flow.complete('new-password','new-password').stage,'success');
 assert.throws(()=>flow.complete('new-password','new-password'),/Verify/);
 assert.equal(JSON.stringify(flow.snapshot()).includes('new-password'),false);
});
test('resend timing, five-attempt limit and expiry apply before granting a reset',()=>{
 let now=0;const flow=api.createPasswordRecovery(true,()=>now);
 flow.request('612345678');assert.throws(()=>flow.request('612345678'),/wait/);
 for(let i=0;i<5;i++)assert.throws(()=>flow.verify('000000'),/incorrect/);
 assert.throws(()=>flow.verify('123456'),/Too many/);
 now=30000;flow.request('612345678');flow.verify('123456');now=330000;
 assert.throws(()=>flow.complete('password123','password123'),/expired/);
 flow.clear();flow.request('612345678');now+=300001;assert.throws(()=>flow.verify('123456'),/expired/);
});
test('release builds do not simulate sending codes or resetting credentials',()=>{
 const flow=api.createPasswordRecovery(false);assert.throws(()=>flow.request('612345678'),/Could not send/);
 assert.throws(()=>flow.verify('123456'),/Request/);assert.throws(()=>flow.complete('new-password','new-password'),/Verify/);
});
test('Login links to recovery and all recovery screens are registered under the session provider',()=>{
 const read=file=>fs.readFileSync(`${__dirname}/../src/${file}`,'utf8');
 const navigation=read('navigation/RootNavigator.tsx');
 for(const screen of ['ForgotPassword','ResetPasswordCode','ResetPasswordNew','ResetPasswordSuccess'])assert.ok(navigation.includes(`name="${screen}"`),screen);
 assert.ok(read('screens/LoginScreen.tsx').includes("navigation.navigate('ForgotPassword')"));
 assert.ok(read('App.tsx').includes('<PasswordRecoveryProvider>'));
});
