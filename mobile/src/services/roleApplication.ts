import {applicationProblem} from './driverOnboarding';
import type {DriverApplication} from './driverOnboarding';

export function applicationDestination(app:DriverApplication){
  if(['approved','pending','needs_changes','draft_saved'].includes(app.status))return 'DriverVerificationStatus' as const;
  if(!app.kind)return 'DriverType' as const;
  if(applicationProblem(app,'details'))return 'DriverDetails' as const;
  if(applicationProblem(app,'vehicle'))return 'DriverVehicle' as const;
  if(applicationProblem(app,'documents'))return 'DriverDocuments' as const;
  if(applicationProblem(app,'selfie'))return 'DriverSelfieIntro' as const;
  return 'DriverReview' as const;
}
