export const ASSESSMENT_TYPES = Object.freeze([
  { id: 'epilepsy-localisation', label: 'Epileptologie – Lokalisationsdiagnostik, prächirurgische und Verlaufsdiagnostik + Neurochirurgie' },
  { id: 'epilepsy-medication-screening', label: 'Epileptologie – kognitives Screening zu Medikamentennebenwirkungen' },
  { id: 'general-neurology', label: 'Kognitives Leistungsprofil/Allgemeine Neurologie' },
  { id: 'dbs-indication', label: 'THS-Indikationsprüfung' },
  { id: 'cognitive-status', label: 'Kognitiver Status/Orientierende Testung' },
  { id: 'suspected-nph', label: 'V. a. Normaldruckhydrozephalus (NPH)' },
  { id: 'memory-clinic', label: 'Demenz-Diagnostik/Memory Clinic' },
]);
export const validAssessmentType = id => ASSESSMENT_TYPES.some(type => type.id === id);
export const assessmentTypeLabel = id => ASSESSMENT_TYPES.find(type => type.id === id)?.label ?? 'Noch nicht zugeordnet';
export const matchesAssessmentType = (assessment, filter) => !filter || (filter === 'unassigned' ? !assessment.assessmentTypeId : assessment.assessmentTypeId === filter);
