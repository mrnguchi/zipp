import i18n from 'i18next';

export function translateUI(text:string|undefined):string|undefined {
  if(!text||!i18n.resolvedLanguage?.startsWith('fr'))return text;
  const key=text.trim().replace(/\s+/g,' ');
  if(!key)return text;
  const translation=i18n.t(key,{ns:'ui',keySeparator:false,nsSeparator:false,defaultValue:key});
  if(translation!==key)return `${/^\s/.test(text)?' ':''}${translation}${/\s$/.test(text)?' ':''}`;
  // Dynamic UI summaries keep their numbers, names and times intact.
  const units:Record<string,string>={trips:'trajets',activities:'activités',activity:'activité',days:'jours',day:'jour',hours:'heures',hour:'heure','min read':'min de lecture'};
  const quantity=key.match(/^(\d+(?:[.,]\d+)?) (trips|activities|activity|days|day|hours|hour|min read)$/);
  if(quantity)return `${quantity[1]} ${units[quantity[2]]}`;
  const today=key.match(/^(Today|Yesterday)( · .*)?$/);
  if(today)return `${today[1]==='Today'?'Aujourd’hui':'Hier'}${today[2]||''}`;
 const captureStep=key.match(/^Step (\d) of 3$/);if(captureStep)return `Étape ${captureStep[1]} sur 3`;
 const blinks=key.match(/^(\d) of 2 blinks detected$/);if(blinks)return `${blinks[1]} clignement(s) sur 2 détecté(s)`;
  return text;
}
