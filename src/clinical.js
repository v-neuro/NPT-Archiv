import { fail, isObject, text } from './shared.js';

export const DIAGNOSIS_STATUSES = Object.freeze([['confirmed','Gesichert'],['suspected','Verdacht']]);
export const HEMISPHERES = Object.freeze([['left','Links'],['right','Rechts'],['bilateral','Beidseits'],['unclear','Unklar']]);
export const emptyClinical = () => ({diagnosis:null,diagnosisStatus:null,dementiaType:null,affectedHemisphere:null});
export const isEpilepsy = type => ['epilepsy-localisation','epilepsy-medication-screening'].includes(type);
export const clinicalOf = assessment => ({...emptyClinical(),...assessment?.clinical});
export const diagnosisStatusLabel = value => DIAGNOSIS_STATUSES.find(([key])=>key===value)?.[1]??'Nicht angegeben';
export const hemisphereLabel = value => HEMISPHERES.find(([key])=>key===value)?.[1]??'Nicht angegeben';

// Archive annotations are separate from source CSV fields. Null always means unrecorded.
export function validateClinical(value) {
  const keys=Object.keys(emptyClinical());
  if(!isObject(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))fail('Klinische Angaben ungültig.');
  for(const [key,max] of [['diagnosis',2000],['dementiaType',200]])if(value[key]!==null&&(!text(value[key],max)||!value[key].trim()))fail('Diagnose oder Demenz-Typ ungültig.');
  if(value.diagnosisStatus!==null&&!DIAGNOSIS_STATUSES.some(([key])=>key===value.diagnosisStatus))fail('Diagnosesicherheit ungültig.');
  if(value.affectedHemisphere!==null&&!HEMISPHERES.some(([key])=>key===value.affectedHemisphere))fail('Betroffene Hemisphäre ungültig.');
  return value;
}
export function clinicalFromInputs(value={}) {
  const optional=value=>typeof value==='string'&&value.trim()===''?null:value??null;
  return validateClinical(Object.fromEntries(Object.keys(emptyClinical()).map(key=>[key,optional(value[key])])));
}
export function clinicalForNewAssessment(value,type) {
  const clinical=clinicalFromInputs(value);
  return {...clinical,dementiaType:type==='memory-clinic'?clinical.dementiaType:null,affectedHemisphere:isEpilepsy(type)?clinical.affectedHemisphere:null};
}

// Only a strict numeric exported age is usable; missing, notes and ambiguous values do not match.
export function ageAtAssessment(document) {
  const cell=document?.raw?.demographics_patient_age;
  if(!cell||cell.missing||typeof cell.raw!=='string'||!/^\s*\d+(?:[.,]\d+)?\s*$/.test(cell.raw))return null;
  const value=Number(cell.raw.trim().replace(',','.'));
  return Number.isFinite(value)?value:null;
}
export function parseAgeRange(input='') {
  const value=input.trim().replace(/[–—]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=');
  if(!value)return {active:false,valid:true,min:null,max:null};
  const number='(\\d+(?:[.,]\\d+)?)',n=value=>Number(value.replace(',','.'));
  let match;
  if((match=value.match(new RegExp('^'+number+'\\s*-\\s*'+number+'$')))){
    const min=n(match[1]),max=n(match[2]);return {active:true,valid:Number.isFinite(min)&&Number.isFinite(max)&&min<=max,min,max};
  }
  if((match=value.match(new RegExp('^(>=|<=|>|<|=)?\\s*'+number+'(\\+)?$')))){
    const age=n(match[2]),operator=match[3]?'>=':match[1]||'=';
    if(!Number.isFinite(age)||match[3]&&match[1])return {active:true,valid:false};
    return {active:true,valid:true,min:operator.startsWith('>')||operator==='='?age:null,max:operator.startsWith('<')||operator==='='?age:null,minExclusive:operator==='>',maxExclusive:operator==='<'};
  }
  return {active:true,valid:false};
}
export function matchesClinicalFilters(assessment,document,filters={}) {
  const clinical=clinicalOf(assessment),contains=(value,needle)=>!needle||String(value??'').toLocaleLowerCase('de').includes(needle.trim().toLocaleLowerCase('de'));
  if(!contains(clinical.diagnosis,filters.diagnosis)||!contains(clinical.dementiaType,filters.dementiaType))return false;
  if(filters.diagnosisStatus&&clinical.diagnosisStatus!==filters.diagnosisStatus)return false;
  if(filters.affectedHemisphere&&clinical.affectedHemisphere!==filters.affectedHemisphere)return false;
  const range=parseAgeRange(filters.age??'');if(!range.valid)return false;if(!range.active)return true;
  const age=ageAtAssessment(document);if(age===null)return false;
  return (range.min===null||(range.minExclusive?age>range.min:age>=range.min))&&(range.max===null||(range.maxExclusive?age<range.max:age<=range.max));
}
