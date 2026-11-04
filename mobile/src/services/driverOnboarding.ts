export type DriverKind = 'vehicle' | 'bike';
export type VehicleCondition = 'good' | 'excellent' | 'premium';
export const vehicleConditions: {value:VehicleCondition;title:string;description:string;category:string}[] = [
  {value:'good',title:'Good',description:'Clean, safe and well maintained, with normal signs of use.',category:'Everyday'},
  {value:'excellent',title:'Excellent',description:'Very clean interior, working air conditioning and minimal wear.',category:'Comfort'},
  {value:'premium',title:'Premium',description:'High-end vehicle, exceptional interior and premium passenger comfort.',category:'Premium'},
];
export function suggestedVehicleCategory(app:Pick<DriverApplication,'kind'|'condition'>){return app.kind==='bike'?'Delivery':vehicleConditions.find(item=>item.value===app.condition)?.category;}
export type VerificationStatus = 'draft' | 'draft_saved' | 'pending' | 'approved' | 'needs_changes';
export type DriverDocumentKey = 'identity_front' | 'identity_back' | 'licence' | 'registration' | 'insurance';
export type VerificationFile = {uri:string;name:string;mimeType:string;size?:number};
export const driverDocuments: {key:DriverDocumentKey;title:string;description:string}[] = [
  {key:'identity_front',title:'Identity document · front',description:'A clear image of your government-issued photo ID.'},
  {key:'identity_back',title:'Identity document · back',description:'Include the full back of the same ID.'},
  {key:'licence',title:'Driving licence',description:'Show the licence details and expiry date clearly.'},
  {key:'registration',title:'Vehicle registration',description:'The registration matching the vehicle or bike you added.'},
  {key:'insurance',title:'Insurance document',description:'Include the policy details and validity dates.'},
];
export type DriverApplication = {
  kind:DriverKind|null;fullName:string;phone:string;city:string;make:string;model:string;plate:string;color:string;condition?:VehicleCondition;
  documents:Partial<Record<DriverDocumentKey,VerificationFile>>;
  selfie?:{uri:string;durationSeconds:number;capturedAt:number;captureMode?:'guided'|'automatic';completedChallenges?:string[]};
  status:VerificationStatus; savedAt?:number;reviewNote?:string;
};
export const emptyDriverApplication = ():DriverApplication=>({kind:null,fullName:'',phone:'',city:'',make:'',model:'',plate:'',color:'',documents:{},status:'draft'});
export function documentProblem(file:VerificationFile):string|undefined {
  if(!/^(file|content|ph):\/\//.test(file.uri))return 'Choose a file from this device.';
  if(!file.name.trim()||!(/^(image\/[a-z0-9.+-]+|application\/pdf)$/i.test(file.mimeType)))return 'Choose an image or a PDF document.';
  if(file.size!==undefined&&(!Number.isFinite(file.size)||file.size<=0||file.size>15*1024*1024))return 'Choose a file smaller than 15 MB.';
}
export function applicationProblem(app:DriverApplication,step:'details'|'vehicle'|'documents'|'selfie'|'review'):string|undefined {
  if(!app.kind)return 'Choose Vehicle or Bike first.';
  if(!app.fullName.trim()||!/^\+?\d{9,15}$/.test(app.phone.replace(/[\s()-]/g,''))||!app.city.trim())return 'Add your full name, a valid phone number, and your city.';
  if(step==='details')return;
  if(!app.make.trim()||!app.model.trim()||!app.plate.trim()||!app.color.trim())return 'Complete your vehicle details.';
  if(app.kind==='vehicle'&&!vehicleConditions.some(item=>item.value===app.condition))return 'Select your vehicle condition.';
  if(step==='vehicle')return;
  if(driverDocuments.some(item=>!app.documents[item.key]||documentProblem(app.documents[item.key]!)))return 'Add each verification document before continuing.';
  if(step==='documents')return;
  if(!app.selfie?.uri||app.selfie.durationSeconds<7)return 'Record the guided live selfie video before continuing.';
}
