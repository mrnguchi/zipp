const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,require){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require});return exports;}
test('language restores on startup, persists changes, and rejects unsupported values',async()=>{
 let saved='fr';const i18n={use(){return this;},async init(options){this.options=options;this.resolvedLanguage=options.lng;},async changeLanguage(value){this.resolvedLanguage=value;}};
 const dictionary=load('i18n/uiFrench.ts',()=>{});
 const api=load('i18n/index.ts',name=>name==='i18next'?{__esModule:true,default:i18n}:name==='expo-localization'?{getLocales:()=>[{languageCode:'en'}]}:name==='react-i18next'?{initReactI18next:{}}:name.includes('async-storage')?{__esModule:true,default:{async getItem(){return saved;},async setItem(k,v){saved=v;}}}:dictionary);
 await api.languageReady;assert.equal(i18n.resolvedLanguage,'fr');
 await api.changeAppLanguage('en');assert.equal(saved,'en');assert.equal(i18n.resolvedLanguage,'en');
 await api.changeAppLanguage('es');assert.equal(saved,'en');
 assert.equal(i18n.options.resources.fr.ui.Home,'Accueil');
});
test('UI translates known labels and leaves arbitrary personal content unchanged',()=>{
 const {frenchUI}=load('i18n/uiFrench.ts',()=>{});
 const i18n={resolvedLanguage:'fr',t:key=>frenchUI[key]||key};
 const {translateUI}=load('i18n/ui.ts',()=>({__esModule:true,default:i18n}));
 assert.equal(translateUI('Home'),'Accueil');assert.equal(translateUI('  Cancel ride '),' Annuler la course ');
 assert.equal(translateUI('Suh Bertrand'),'Suh Bertrand');assert.equal(translateUI('Molyko Junction, Buea'),'Molyko Junction, Buea');
 assert.equal(translateUI('12 trips'),'12 trajets');i18n.resolvedLanguage='en';assert.equal(translateUI('Home'),'Home');
});
