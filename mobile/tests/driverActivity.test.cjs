const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/services/driverActivity.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api});
const now=Date.UTC(2026,10,4,12);
const job=(id,phase='completed',kind='ride',createdAt=now)=>({id,phase,kind,createdAt,customer:'Marie E.',pickup:'Molyko, Buea',destination:'University of Buea',fare:2000,fee:200});
test('driver activity filters types, statuses and routes without duplicating active trips',()=>{
 const active=job('active','to_pickup'),history=[job('active','to_pickup'),job('ride'),job('delivery','completed','delivery'),job('canceled','canceled')];
 assert.equal(api.filterDriverActivity(history,active,'all','all','').length,4);
 assert.equal(api.filterDriverActivity(history,active,'all','active','')[0].id,'active');
 assert.equal(api.filterDriverActivity(history,active,'delivery','completed','MOLYKO')[0].id,'delivery');
 assert.equal(api.filterDriverActivity(history,active,'all','canceled','Marie')[0].id,'canceled');
 assert.equal(api.filterDriverActivity([],job('offer','offer'),'all','all','').length,0);
});
test('grouping prioritizes active trips and respects Cameroon midnight',()=>{
 const midnight=Date.UTC(2026,10,3,23,30);
 const result=api.groupDriverActivity([job('older','completed','ride',midnight-172800000),job('yesterday','completed','ride',midnight-86400000),job('today','completed','ride',midnight-1200000),job('active','arrived','ride',midnight-200000000)],midnight);
 assert.deepEqual(Array.from(result,section=>section.title),['In progress','Today','Yesterday','Earlier']);
 assert.equal(result[1].data[0].id,'today');
});
