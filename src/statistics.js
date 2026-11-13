import { ASSESSMENT_TYPES } from './assessment-types.js';
import { selectedRevision, isExcluded } from './model.js';

const DAY=86400000;
export const MAX_STATISTICS_BUCKETS=1200;
export const STATISTICS_PRESETS=[['1m','Ein Monat',1],['3m','Drei Monate',3],['6m','Halbes Jahr',6],['1y','Ein Jahr',12],['custom','Manueller Zeitraum',null]];
export const STATISTICS_INTERVALS=[['day','Tag'],['week','Woche'],['month','Monat']];
const SHORT_LABELS=['Epileptologie · Lokalisation','Epileptologie · Medikamente','Allgemeine Neurologie','THS-Indikationsprüfung','Orientierende Testung','NPH','Memory Clinic'];
export const newStatisticsSettings=()=>({preset:'1m',interval:'week',from:'',to:'',includeExcluded:false,types:null,bucketKey:''});
export const localToday=(date=new Date())=>[String(date.getFullYear()).padStart(4,'0'),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const stamp=time=>new Date(time).toISOString().slice(0,10);
const time=day=>Date.parse(day+'T00:00:00Z');
export function validStatisticsDay(day){return typeof day==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)&&day.slice(0,4)!=='0000'&&Number.isFinite(time(day))&&stamp(time(day))===day;}
function shiftMonths(value,months){
  const date=new Date(value),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);
  const next=new Date(date);next.setUTCMonth(next.getUTCMonth()+1);next.setUTCDate(0);date.setUTCDate(Math.min(day,next.getUTCDate()));return date.getTime();
}
export function statisticsRange(settings,today=localToday()){
  if(settings.preset==='custom')return {from:settings.from,to:settings.to,valid:validStatisticsDay(settings.from)&&validStatisticsDay(settings.to)&&settings.from<=settings.to};
  const preset=STATISTICS_PRESETS.find(([id])=>id===settings.preset);
  if(!preset||!validStatisticsDay(today))return {from:'',to:'',valid:false};
  // Rolling calendar months through today, inclusive. The visible dates define the exact scope.
  return {from:stamp(shiftMonths(time(today)+DAY,-preset[2])),to:today,valid:true};
}
export function statisticsSeries(state){
  const result=ASSESSMENT_TYPES.map((type,index)=>({...type,shortLabel:SHORT_LABELS[index],color:index}));
  result.push({id:'unassigned',label:'Noch nicht zugeordnet',shortLabel:'Nicht zugeordnet',color:7});
  const known=new Set(result.map(type=>type.id));
  for(const assessment of Object.values(state.assessments))if(assessment.assessmentTypeId&&!known.has(assessment.assessmentTypeId)){
    known.add(assessment.assessmentTypeId);result.push({id:assessment.assessmentTypeId,label:`Unbekannte Untersuchungsart (${assessment.assessmentTypeId})`,shortLabel:assessment.assessmentTypeId,color:7});
  }
  return result;
}
export function bucketStart(value,interval){
  const date=new Date(value);
  if(interval==='week')date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  if(interval==='month')date.setUTCDate(1);
  return date.getTime();
}
const nextBucket=(value,interval)=>interval==='month'?shiftMonths(value,1):value+DAY*(interval==='week'?7:1);
export function bucketLabel(key,interval){
  if(interval==='day')return key.split('-').reverse().join('.');
  if(interval==='month')return key.slice(5,7)+'.'+key.slice(0,4);
  const monday=time(key),thursday=new Date(monday+3*DAY),year=thursday.getUTCFullYear(),first=bucketStart(time(String(year).padStart(4,'0')+'-01-04'),'week');
  return `KW ${String(Math.round((monday-first)/(7*DAY))+1).padStart(2,'0')} / ${year}`;
}
export function aggregateStatistics(state,settings,today=localToday()){
  const range=statisticsRange(settings,today),available=statisticsSeries(state),series=available.filter(type=>settings.types===null||settings.types.has(type.id));
  const result={range,available,series,valid:range.valid&&STATISTICS_INTERVALS.some(([id])=>id===settings.interval),total:0,patients:0,unassignedPatients:0,undated:0,excluded:0,buckets:[],tooManyBuckets:false,totals:Object.fromEntries(series.map(type=>[type.id,0]))};
  if(!result.valid)return result;
  const selected=new Set(series.map(type=>type.id)),patients=new Set(),counts=new Map();
  for(const assessment of Object.values(state.assessments)){
    const type=assessment.assessmentTypeId??'unassigned';if(!selected.has(type)||!settings.includeExcluded&&isExcluded(assessment))continue;
    const date=selectedRevision(assessment)?.document.date;if(!validStatisticsDay(date)){result.undated++;continue;}
    if(date<range.from||date>range.to)continue;
    result.total++;result.totals[type]++;if(isExcluded(assessment))result.excluded++;
    if(assessment.patientId)patients.add(assessment.patientId);else result.unassignedPatients++;
    const key=stamp(bucketStart(time(date),settings.interval));if(!counts.has(key))counts.set(key,new Map());const row=counts.get(key);row.set(type,(row.get(type)??0)+1);
  }
  result.patients=patients.size;
  for(let start=bucketStart(time(range.from),settings.interval);start<=time(range.to);start=nextBucket(start,settings.interval)){
    if(result.buckets.length===MAX_STATISTICS_BUCKETS){result.buckets=[];result.tooManyBuckets=true;break;}
    const key=stamp(start),values=Object.fromEntries(series.map(type=>[type.id,counts.get(key)?.get(type.id)??0]));
    result.buckets.push({key,label:bucketLabel(key,settings.interval),from:stamp(Math.max(start,time(range.from))),to:stamp(Math.min(nextBucket(start,settings.interval)-DAY,time(range.to))),values,total:Object.values(values).reduce((sum,n)=>sum+n,0)});
  }
  return result;
}
