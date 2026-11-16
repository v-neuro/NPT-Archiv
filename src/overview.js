import { sourceValue } from './csv.js';
import { selectedRevision, matchesArchiveStatus } from './model.js';
import { assessmentTypeLabel, matchesAssessmentType } from './assessment-types.js';
import { matchesClinicalFilters } from './clinical.js';
import { hasPerformanceValue } from './summary.js';

export function patientLabel(patient, initials='') {
  return patient ? `${patient.identifier}${initials.trim()?` (${initials.trim()})`:''}${patient.label?' · '+patient.label:''}` : 'Nicht zugeordnet';
}

// Derive initials from the latest selected source. This also works for existing archives
// and follows later source-revision selections without duplicating patient metadata.
export function patientInitials(assessments) {
  const result=new Map(),dates=new Map();
  for(const assessment of assessments) {
    const doc=selectedRevision(assessment)?.document,initials=sourceValue(doc,'demographics_patient_initials').trim();
    if(assessment.patientId&&initials&&(!result.has(assessment.patientId)||(doc.date??'')>=(dates.get(assessment.patientId)??''))) {
      result.set(assessment.patientId,initials);dates.set(assessment.patientId,doc.date??'');
    }
  }
  return result;
}

export function matchesOverview(assessment,patient,filters={}) {
  const doc=selectedRevision(assessment)?.document;
  const hay=[patientLabel(patient,sourceValue(doc,'demographics_patient_initials')),assessment.stayId,assessment.sessionId,
    assessmentTypeLabel(assessment.assessmentTypeId),doc?.date,doc?.dateText,sourceValue(doc,'demographics_examiner_initials'),
    sourceValue(doc,'demographics_patient_gender'),JSON.stringify(doc?.normalized)].join(' ').toLocaleLowerCase('de');
  return (!filters.query?.trim()||hay.includes(filters.query.trim().toLocaleLowerCase('de')))
    &&matchesAssessmentType(assessment,filters.type)&&matchesArchiveStatus(assessment,filters.status??'included')
    &&(!filters.measure||hasPerformanceValue(doc,filters.measure))&&matchesClinicalFilters(assessment,doc,filters.clinical);
}
