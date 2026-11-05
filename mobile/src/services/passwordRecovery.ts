export type RecoveryStage = 'phone' | 'code' | 'password' | 'success';
export type RecoveryState = { stage: RecoveryStage; phone: string; expiresAt: number; resendAt: number; attempts: number };
export function normalizeRecoveryPhone(value: string) {
  const digits=value.replace(/[\s()+-]/g,'').replace(/^237/,'');
  return /^6\d{8}$/.test(digits)?`+237${digits}`:null;
}
export function recoveryPasswordError(password:string,confirm:string) {
  if(password.length<8)return 'Use at least 8 characters.';
  if(password.length>128)return 'Use no more than 128 characters.';
  if(!password.trim())return 'Enter a valid password.';
  if(password!==confirm)return 'Your passwords do not match.';
  return '';
}
// Development adapter only. Production must request and verify a server-issued
// challenge and consume its reset token atomically; no password is persisted here.
export function createPasswordRecovery(development:boolean,clock=Date.now) {
  let state:RecoveryState={stage:'phone',phone:'',expiresAt:0,resendAt:0,attempts:0};
  const snapshot=()=>({...state});
  return {
    snapshot,
    clear(){state={stage:'phone',phone:'',expiresAt:0,resendAt:0,attempts:0};return snapshot();},
    request(value:string){
      const phone=normalizeRecoveryPhone(value);
      if(!phone)throw Error('Enter a valid Cameroon phone number.');
      if(!development)throw Error('Could not send a reset code. Please try again later.');
      if(state.phone===phone&&clock()<state.resendAt)throw Error('Please wait before requesting another code.');
      if(state.stage==='password')throw Error('Finish resetting your password or start again.');
      state={stage:'code',phone,expiresAt:clock()+300000,resendAt:clock()+30000,attempts:0};return snapshot();
    },
    verify(code:string){
      if(state.stage!=='code')throw Error('Request a reset code first.');
      if(clock()>=state.expiresAt)throw Error('This code has expired. Request a new code.');
      if(state.attempts>=5)throw Error('Too many attempts. Request a new code.');
      state={...state,attempts:state.attempts+1};
      if(!development||code!=='123456')throw Error('That code is incorrect. Please try again.');
      state={...state,stage:'password'};return snapshot();
    },
    complete(password:string,confirm:string){
      if(!development||state.stage!=='password')throw Error('Verify your reset code first.');
      if(clock()>=state.expiresAt)throw Error('Your reset session has expired. Please start again.');
      const error=recoveryPasswordError(password,confirm);if(error)throw Error(error);
      state={...state,stage:'success',expiresAt:0,resendAt:0};return snapshot();
    },
  };
}
