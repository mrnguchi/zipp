import type { DriverJob } from './driverWorkspace';
export type DriverActivityKind='all'|'ride'|'delivery';
export type DriverActivityStatus='all'|'active'|'completed'|'canceled';
export function filterDriverActivity(history:DriverJob[],active:DriverJob|undefined,kind:DriverActivityKind,status:DriverActivityStatus,query:string){
  const jobs=[...(active&&!['offer','completed','canceled'].includes(active.phase)?[active]:[]),...history];
  const term=query.trim().toLowerCase();
  return jobs.filter((job,index)=>jobs.findIndex(item=>item.id===job.id)===index&&job.phase!=='offer'&&(kind==='all'||job.kind===kind)&&(status==='all'||(status==='active'?!['completed','canceled'].includes(job.phase):job.phase===status))&&`${job.customer} ${job.pickup} ${job.destination} ${job.id}`.toLowerCase().includes(term)).sort((a,b)=>b.createdAt-a.createdAt);
}
const dateKey=(time:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Douala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
export function groupDriverActivity(jobs:DriverJob[],now:number){
  const groups:{title:string;data:DriverJob[]}[]=[];
  for(const job of jobs){
    const title=!['completed','canceled'].includes(job.phase)?'In progress':dateKey(job.createdAt)===dateKey(now)?'Today':dateKey(job.createdAt)===dateKey(now-86400000)?'Yesterday':'Earlier';
    const group=groups.find(item=>item.title===title);if(group)group.data.push(job);else groups.push({title,data:[job]});
  }
  return groups.sort((a,b)=>['In progress','Today','Yesterday','Earlier'].indexOf(a.title)-['In progress','Today','Yesterday','Earlier'].indexOf(b.title));
}
