import { validPdfReady, validPdfStatus } from './pdf-channel.js';
import {statisticsView} from './statistics-view.js';
import {newStatisticsSettings,statisticsRange,statisticsSeries} from './statistics.js';
import { APP_VERSION, uid, fail, sha256, MAX_FILE } from './shared.js';
import { DraftStore } from './drafts.js';
import { capabilities, canOpen, permission, FolderStorage, createArchive, readManifest, probeFolder, inspectFolder } from './storage.js';
import { Archive, copyArchive } from './archive.js';
import { importedFieldGroups, importedFieldLabel, importedCellState } from './imported-fields.js';
import { groupedMeasurementFields } from './measurement-labels.js';
import { importReceipt, recheckConnection, buildAssignment } from './workflow.js';
import { saveFeedbackExpired } from './save-status.js';
import { recentChanges, matchesHistoryFilters, validHistoryFilters } from './history.js';
import { exportArchiveCsv } from './export.js';
import { emptyClinical, clinicalOf, clinicalFromInputs, clinicalForNewAssessment, isEpilepsy, DIAGNOSIS_STATUSES, HEMISPHERES, diagnosisStatusLabel, hemisphereLabel, parseAgeRange, matchesClinicalFilters } from './clinical.js';
import { inspectFiles, planPatientImport, buildPatientImport, buildAssessmentPdf, validImportActor } from './import.js';
import { objectPath, selectedRevision, isExcluded, matchesArchiveStatus, applyOperations } from './model.js';
import { sourceValue, changedFields } from './csv.js';
import { columns } from './catalogue.js';
import { ASSESSMENT_TYPES, assessmentTypeLabel, validAssessmentType, matchesAssessmentType } from './assessment-types.js';
import { SUMMARY_MEASURES, fieldLabel, performanceFields, hasPerformanceValue, isNumericSourceValue, performanceContext } from './summary.js';

const $ = s => document.querySelector(s);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = d => d ? d.split('-').reverse().join('.') : 'Datum unbekannt';
const pill = (s, kind = '') => `<span class="pill ${kind}">${escape(s)}</span>`;
const option = (value, label, selected) => `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`;
const c = capabilities();
let archive = null, page = 'home', rows = [], currentId = '', currentPatient = '', query = '', measure = '', filterStatus = 'included', listPage = 0, busy = false;
let writer = false, releaseLock = null, lockCompletion = null, singleWriter = false, noticeTimer, sourceFolderName = '', lastProbe = '', pendingReport = null;
let editDialogBusy=false,pendingEditAction=null,lockError='',saveFeedback=null,lastImportReceipt=null;
let sessionActor='',saving=false,guardBusy=false,pendingAction=null;
const drafts=new DraftStore(),skipDraftCapture=new Set();
let probeError = null, probeProgress = '', selectedFolder = null;
let filterType='',patientQuery='',patientResultsOpen=true,detailData=null,importStage=1;
let fieldQuery='',comparisonQuery='',busyMessage='Bitte warten… Fenster geöffnet lassen.';
const emptyClinicalFilters=()=>({diagnosis:'',diagnosisStatus:'',dementiaType:'',affectedHemisphere:'',age:''});
let clinicalFilters=emptyClinicalFilters();
const emptyHistoryFilters=()=>({editFrom:'',editTo:'',assessmentFrom:'',assessmentTo:'',patientId:''});
let historyFilters=emptyHistoryFilters(),historyPage=0,feedbackTimer;
let assessmentPdfError=null;
let statisticsSettings=newStatisticsSettings();
const historyCatalogs=new WeakMap();
const exportSelections={assessments:new Set(),patients:new Set()},viewExportIds={assessments:[],patients:[]};
const fieldCatalogs=new WeakMap();
function currentFields(){const data=state();if(!fieldCatalogs.has(data))fieldCatalogs.set(data,performanceFields(Object.values(data.assessments)));return fieldCatalogs.get(data);}
function fieldFilter(){
  const fields=currentFields(),matches=fields.filter(key=>fieldLabel(key).toLocaleLowerCase('de').includes(fieldQuery.toLocaleLowerCase('de')));
  return `<details class="extra-filter" id="field-filter"><summary>Weitere Filter${measure||Object.values(clinicalFilters).some(Boolean)?' · aktiv':''}</summary><div class="field-filter-panel"><label>Messwert suchen<input id="field-search" type="search" value="${escape(fieldQuery)}" placeholder="z. B. TMT, MoCA oder Feldname" autocomplete="off"></label><label class="section-spacer">Messwert / Feld vorhanden<select id="measure-filter">${option('','Alle Untersuchungen',measure)}${measure&&!matches.includes(measure)?`<optgroup label="Ausgewählt">${option(measure,fieldLabel(measure),measure)}</optgroup>`:''}${measurementOptions(matches,measure)}</select></label><p class="quiet section-spacer" role="status">${matches.length} ${fieldQuery?`von ${fields.length} `:''}numerische Leistungsfelder aus den gewählten CSV-Fassungen. Auch 0 zählt als Wert.</p>${clinicalFilterInputs()}</div></details>`;
}
function measurementOptions(keys,selected) {return groupedMeasurementFields(keys).map(group=>`<optgroup label="${escape(group.label)}">${group.fields.map(key=>option(key,fieldLabel(key),selected)).join('')}</optgroup>`).join('');}
let detailError='';
let patientValueDocs=new Map(),patientValueKey='';
const currentPatientValueKey=()=>`${currentPatient}|${filterType}|${archive?.snapshot.head}`;
const typeOptions=(selected='',filter=false)=>option('',filter?'Alle Untersuchungsarten':'Bitte Untersuchungsart auswählen',selected)+(filter?option('unassigned','Noch nicht zugeordnet',selected):'')+ASSESSMENT_TYPES.map(t=>option(t.id,t.label,selected)).join('');
const state = () => archive?.snapshot.state;
const writable = () => archive && writer && singleWriter && !archive.snapshot.readOnly && !saveFeedback?.needsCheck && !busy;
const patients = () => Object.values(state()?.patients ?? {});
const newImportDraft=()=>({identifier:'',stayId:'',assessmentTypeId:'',confirmedPatientId:'',actor:sessionActor,clinical:emptyClinical()});
let importDraft=newImportDraft(),importFiles=[];
function resetImport(){rows=[];importFiles=[];importDraft=newImportDraft();importStage=1;}
const patientText = id => { const p = state()?.patients[id]; return p ? `${p.identifier}${p.label ? ' · ' + p.label : ''}` : 'Nicht zugeordnet'; };
const titleOf = a => `${patientText(a.patientId)} · ${fmtDate(selectedRevision(a)?.document.date)}`;
function notice(message, error = false) {
  const node = $('#notice'); node.textContent = message; node.className = `visible${error ? ' error' : ''}`;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node.className = ''; }, error ? 16000 : 7500);
}
async function run(task) {
  if (busy) return;
  busy = true; render();
  try { return await task(); } catch (e) { notice(saveFeedback?.needsCheck?'Bitte den Hinweis zum Speicherstand beachten.':e.message || 'Vorgang fehlgeschlagen. Ordner erneut auswählen.', true); }
  finally { busy = false; busyMessage='Bitte warten… Fenster geöffnet lassen.'; render(); }
}
async function pick(mode = 'readwrite') {
  if (!canOpen(c)) fail('Ordnerzugriff nicht verfügbar. Microsoft Edge über eine freigegebene HTTPS-Adresse öffnen und IT-Richtlinien prüfen.');
  const handle = await window.showDirectoryPicker({ mode, id: 'npt-assessment-archive' });
  await permission(handle, mode, true); return new FolderStorage(handle);
}
async function lockFor(id) {
  if (releaseLock) { releaseLock(); releaseLock = null; await lockCompletion; }
  writer = false;
  if (!c.locks) return;
  await new Promise((resolve, reject) => {
    lockCompletion = navigator.locks.request(`npt-archive-writer:${id}`, { ifAvailable: true }, async lock => {
      if (!lock) { resolve(); return; }
      writer = true;
      await new Promise(done => { releaseLock = done; resolve(); });
    });
    lockCompletion.catch(reject);
  });
}
async function rememberFolder(storage) {
  let result;
  try { result = await inspectFolder(storage); }
  catch (error) { result = { kind: 'blocked', message: error.message }; }
  selectedFolder = { storage, name: storage.handle.name, ...result };
  return selectedFolder;
}
async function activateFolder(storage, create, target) {
  await permission(storage.handle, create ? 'readwrite' : 'read', true);
  if(create)await createArchive(storage);else await readManifest(storage);
  const opened = await Archive.open(storage,{compact:true});
  await releaseWriter();lockError='';saveFeedback=null;lastImportReceipt=null;
  archive = opened; sourceFolderName = storage.handle.name; singleWriter = false;
  clearDrafts([...drafts.entries.keys()]);resetImport();exportSelections.assessments.clear();exportSelections.patients.clear(); selectedFolder = null; detailData=null;detailError='';patientValueDocs.clear();patientValueKey='';importStage=1;statisticsSettings=newStatisticsSettings();assessmentPdfError=null;historyFilters=emptyHistoryFilters();historyPage=0;clinicalFilters=emptyClinicalFilters();query='';fieldQuery='';filterType='';filterStatus='included';patientQuery='';patientResultsOpen=true;currentPatient='';measure='';listPage=0;page = target;
}
async function openFolder(create = false, target = 'assessments') {
  // Picker executes while this handler still has user activation.
  const storage = await pick(create ? 'readwrite' : 'read');
  const choice = await rememberFolder(storage);
  lastProbe='';probeError=null;
  if (!create && choice.kind === 'archive') await activateFolder(storage, false, target);
  else { page = 'storage'; notice('Ordner ausgewählt. Sie können ihn jetzt prüfen oder die Bibliothek öffnen/anlegen.'); }
}
async function activateSelected(target) {
  const choice = selectedFolder;
  if (!choice || !['empty', 'archive'].includes(choice.kind)) fail('Einen leeren Ordner oder ein lesbares Archiv auswählen.');
  try { await activateFolder(choice.storage, choice.kind === 'empty', target); }
  catch (error) { await rememberFolder(choice.storage); throw error; }
  notice(choice.kind === 'empty' ? 'Bibliothek angelegt und geöffnet.' : 'Bibliothek geöffnet.');
}
function selectedFolderCard(target = 'import') {
  const choice = selectedFolder;
  if (!choice) return '';
  const usable = ['empty', 'archive'].includes(choice.kind);
  return `<section class="card" id="selected-folder"><div class="eyebrow">Ausgewählter Ordner</div><h2>${escape(choice.name)}</h2><p class="muted">${choice.kind === 'empty' ? 'Leerer Ordner ausgewählt.' : choice.kind === 'archive' ? 'Bibliothek gefunden.' : choice.kind === 'blocked' ? escape(choice.message) : 'Dieser Ordner enthält Dateien, aber kein lesbares Archiv. Für ein neues Archiv einen leeren Ordner wählen. Vorhandene Dateien werden nicht verändert.'}</p>${usable ? `<button class="primary" id="activate-folder" data-activate-folder="${target}" ${busy ? 'disabled' : ''}>${choice.kind === 'empty' ? 'Bibliothek hier anlegen' : 'Bibliothek öffnen'}</button>` : ''}</section>`;
}
function archiveSetupView() {
  if (selectedFolder) return selectedFolderCard(page);
  return `<section class="card"><h1>Bibliothek öffnen</h1><div class="actions"><button id="open-folder" class="primary" ${!canOpen(c)||busy?'disabled':''}>Meine Bibliothek öffnen</button><button id="create-folder" ${!canOpen(c)||busy?'disabled':''}>Neue Bibliothek anlegen</button></div>${folderAccessNotice()}</section>`;
}
const navDrawings={changes:'<path d="M3 12a9 9 0 1 0 3-7M3 3v6h6m3-2v5l3 2"/>',storage:'<path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3"/>',import:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',assessments:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',patients:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5v1"/>',recovery:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m6 6 3 3m6 6 3 3M6 18l3-3m6-6 3-3"/>'};
const navItem=(id,icon,label)=>`<button data-nav="${id}" class="nav-item ${page===id||(id==='assessments'&&page==='detail')||(id==='import'&&page==='complete')?'active':''}" ${page===id||(id==='assessments'&&page==='detail')||(id==='import'&&page==='complete')?'aria-current="page"':''}><span aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${navDrawings[id]}</svg></span>${label}</button>`;
function nav() {
  return [['storage','▱','Bibliothek öffnen'],['import','↓','Importieren'],['assessments','▤','Untersuchungen'],['patients','♧','Patienten'],['changes','↺','Neueste Änderungen']].map(args=>navItem(...args)).join('');
}
function folderAccessNotice() {
  return canOpen(c)?'':'<div class="note error" role="alert">Ordnerzugriff ist hier nicht verfügbar. Öffnen Sie die HTTPS-Adresse in Microsoft Edge. Weitere Hilfe finden Sie unter „Sicherung & Hilfe“.</div>';
}
function draftControls(form){return [...form.querySelectorAll('input,textarea,select')].filter(input=>input.type!=='file');}
function formValues(form){return draftControls(form).map(input=>({key:input.id||input.name||input.dataset.diagnosisStatus,value:input.type==='checkbox'?input.checked:input.value}));}
function captureFormDrafts(){for(const form of document.querySelectorAll('form[data-draft-key]'))if(!skipDraftCapture.has(form.dataset.draftKey))drafts.update(form.dataset.draftKey,formValues(form));}
function mountFormDrafts(){
  for(const [id,key] of [['clinical-edit-form',`clinical:${currentId}`],['assignment-form',`assignment:${currentId}`],['create-patient','patient:create'],['revision-form',`revision:${currentId}`]]){
    const form=document.getElementById(id);if(!form)continue;form.dataset.draftKey=key;
    const values=drafts.mount(key,formValues(form));for(const input of draftControls(form)){const value=values.find(v=>v.key===(input.id||input.name||input.dataset.diagnosisStatus));if(value)if(input.type==='checkbox')input.checked=value.value;else input.value=value.value;}
  }
  for(const form of document.querySelectorAll('[data-unlinked-form]')){form.dataset.draftKey='attachment:'+form.dataset.unlinkedForm;const values=drafts.mount(form.dataset.draftKey,formValues(form));for(const input of draftControls(form)){const value=values.find(v=>v.key===input.id);if(value)input.value=value.value;}}
  skipDraftCapture.clear();
}
function clearDrafts(keys){drafts.clear(keys);for(const key of keys)skipDraftCapture.add(key);}
function importIsPending(){return Boolean(importFiles.length||importDraft.identifier||importDraft.stayId||importDraft.assessmentTypeId||Object.values(importDraft.clinical).some(Boolean));}
function hasUnsaved(){captureFormDrafts();return drafts.dirtyKeys().length>0||importIsPending();}
function guardAction(action){
  if(busy||guardBusy||pendingAction)return;
  if(!hasUnsaved()){action();return;}
  pendingAction=action;$('#draft-error').hidden=true;$('#draft-dialog').showModal();$('#draft-cancel').focus();
}
async function savePendingEdits(){
  if(!writable())fail('Zum Speichern ist der Bearbeitungs-Modus erforderlich.');
  const operations=[];const keys=drafts.dirtyKeys();
  for(const key of keys){
    const form=document.querySelector(`form[data-draft-key="${key}"]`);if(!form)fail('Bitte die geänderte Seite erneut öffnen.');
    if(!form.checkValidity())fail('Bitte die Angaben auf der Seite vervollständigen.');
    if(key.startsWith('clinical:'))operations.push({type:'assessment.clinical.set',assessmentId:currentId,clinical:readClinicalForm(form,clinicalOf(state().assessments[currentId]))});
    if(key.startsWith('assignment:'))operations.push(...buildAssignment(state(),currentId,{identifier:$('#reassign-patient').value,stayId:$('#reassign-stay').value,assessmentTypeId:$('#reassign-type').value,reason:$('#reassign-reason').value}));
    if(key.startsWith('revision:'))operations.push({type:'revision.select',assessmentId:currentId,revisionId:$('#selected-revision').value});
    if(key.startsWith('attachment:'))operations.push({type:'attachment.link',assessmentId:form.querySelector('[data-link-target]').value,attachmentId:key.slice(11),note:form.querySelector('[data-link-note]').value});
    if(key==='patient:create')operations.push({type:'patient.create',patient:{id:uid(),identifier:form.querySelector('[name="identifier"]').value,label:''}});
  }
  let built=null,receipt=null;if(importIsPending()){built=buildPatientImport(rows,state(),{...importDraft,actor:sessionActor});receipt=importReceipt(built,planPatientImport(rows,state(),importDraft),importDraft);operations.push(...built.operations);}
  if(!operations.length)return true;
  applyOperations(state(),operations);
  return run(async()=>{await commit(operations,built?.files??new Map(),sessionActor,receipt);if(built){lastImportReceipt=receipt;resetImport();}return true;});
}
function render() {
  captureFormDrafts();
  const statisticsScroll=page==='home'?$('#statistics-chart-scroll')?.scrollLeft??0:0;
  const enteringPage=$('main')?.dataset.page!==page;const patientScroll=enteringPage?0:$('.patient-matches')?.scrollTop??0;
  const openDetails=$('main')?.dataset.page===page?[...document.querySelectorAll('main details[open]')].map(node=>node.id||node.querySelector(':scope > summary')?.textContent):[];
  const lockNotice=archive?saveFeedbackView():'';
  $('#app').innerHTML = `<div class="shell"><aside><button class="brand" id="home-logo" type="button" data-nav="home" aria-label="NPT-Archiv · Zur Startseite" ${page==='home'?'aria-current="page"':''}><img class="brand-image" src="./icons/brand.png" width="112" height="80" alt=""></button><div class="brand-sub">NPT-Archiv</div><nav aria-label="Hauptnavigation">${nav()}</nav><div class="aside-bottom">${navItem('recovery','↺','Sicherung & Hilfe')}<div class="aside-meta"><strong><span class="local-dot"></span>Patienteninhalte bleiben lokal</strong>Version ${APP_VERSION}</div></div></aside><div class="workspace"><header class="topbar"><div class="topbar-tools">${archive ? pill(sourceFolderName, archive.snapshot.readOnly ? 'warn' : '')+modeView() : selectedFolder ? pill(selectedFolder.name+' · noch nicht geöffnet','warn') : pill('Kein Archiv geöffnet','warn')}</div></header>${busy ? `<div class="busybar" role="status">${escape(busyMessage)}</div>` : ''}<main>${archive?.snapshot.manifest.syntheticOnly?'<div class="note good">Übungsbibliothek · erfundene Daten</div>':''}${lockNotice}${(!archive && !['home','storage','recovery'].includes(page)) ? archiveSetupView() : views[page]() }</main></div></div>`;
  $('main').dataset.page=page;$('main').dataset.enter=String(enteringPage);
  for(const node of document.querySelectorAll('main details'))if(openDetails.includes(node.id||node.querySelector(':scope > summary')?.textContent))node.open=true;
  mountFormDrafts();bind();if($('.patient-matches'))$('.patient-matches').scrollTop=patientScroll;
  if($('#statistics-chart-scroll'))$('#statistics-chart-scroll').scrollLeft=statisticsScroll;
  if(saveFeedback?.needsCheck)document.querySelectorAll('#patient-import-form input,#patient-import-form select,#clinical-import-form input,#clinical-import-form textarea,#clinical-import-form select,#review-clinical,#actor,[data-revision-field],[data-remove-import-file],[data-replace-pdf],[data-add-csv],[data-import-stage]').forEach(control=>{control.disabled=true;});
  if(busy)document.querySelectorAll('#app button,#app input,#app select,#app textarea').forEach(control=>{control.disabled=true;});
  armFeedbackTimeout();
}
async function releaseWriter(){if(releaseLock){releaseLock();releaseLock=null;await lockCompletion;}writer=false;singleWriter=false;sessionActor='';}
function modeView(){
  const editing=writer&&singleWriter&&!archive.snapshot.readOnly&&!saveFeedback?.needsCheck,blocked=busy||archive.snapshot.readOnly||saveFeedback?.needsCheck;
  const label=editing?'Bearbeitungs-Modus':'Ansichts-Modus';
  const icon=editing?'<path d="m4 16 11-11 4 4L8 20H4zM13 7l4 4"/>':'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
  return `<button id="mode-toggle" class="mode-toggle mode-${editing?'edit':'view'}" data-mode="${editing?'edit':'view'}" aria-label="${label} · ${editing?'In den Ansichts-Modus wechseln':'In den Bearbeitungs-Modus wechseln'}" ${editing?'':'aria-haspopup="dialog"'} ${blocked?'disabled':''}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${icon}</svg>${label}</button>${editing?`<span class="session-identity" title="Bearbeiterkürzel">${escape(sessionActor)}</span>`:''}<button id="refresh-view" class="topbar-refresh" title="Ansicht aktualisieren" aria-label="Ansicht aktualisieren" ${blocked?'disabled':''}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-1l2 2M4 16l2 2a8 8 0 0 0 13-1"/></svg></button>`;
}
function openEditDialog(action=null){
  if(busy||!archive||archive.snapshot.readOnly||saveFeedback?.needsCheck)return;
  pendingEditAction=action;const dialog=$('#edit-mode-dialog');$('#session-actor').value='';$('#single-writer').checked=false;$('#confirm-editing').disabled=true;$('#edit-mode-error').textContent='';$('#edit-mode-error').hidden=true;
  dialog.showModal();$('#single-writer').focus();
}
function saveFeedbackView(){
  if(!saveFeedback&&!archive.snapshot.readOnly)return '';
  const feedback=archive.snapshot.readOnly&&!saveFeedback?.needsCheck?{...saveFeedback,outcome:'uncertain',message:'Die Bibliothek muss geprüft werden. Angezeigt wird der bisher lesbare Stand.',needsCheck:true}:saveFeedback;
  if(saveFeedbackExpired(feedback))return '';
  if(feedback.outcome==='saved'&&!feedback.needsCheck&&(page==='complete'||!feedback.recovered))return '';
  const titles={saved:'Gespeichert', 'not-saved':'Nicht gespeichert',uncertain:'Speicherstand noch unklar'};
  return `<section class="note ${feedback.outcome==='saved'&&!feedback.needsCheck?'good':'error'} save-feedback" id="save-feedback" role="status" aria-live="polite"><strong>${titles[feedback.outcome]}</strong><p>${escape(feedback.message)}</p>${feedback.needsCheck||archive.snapshot.readOnly?'<p>Verbindung zum Laufwerk wiederherstellen und prüfen. Bitte den Import bis dahin nicht wiederholen.</p><div class="actions"><button id="recheck-connection">Verbindung erneut prüfen</button><button id="reselect-library">Bibliotheksordner erneut auswählen</button></div>':''}${feedback.details?`<details><summary>Technische Einzelheiten</summary><p>${escape(feedback.details)}</p></details>`:''}</section>`;
}
function armFeedbackTimeout(){
  const feedback=saveFeedback;
  if(busy||feedback?.outcome!=='saved'||feedback.needsCheck||!feedback.recovered||feedback.dismissAt)return;
  feedback.dismissAt=Date.now()+5000;clearTimeout(feedbackTimer);
  feedbackTimer=setTimeout(()=>{if(saveFeedback===feedback&&saveFeedbackExpired(feedback)&&!archive?.snapshot.readOnly)$('#save-feedback')?.remove();},5000);
}
function clearLoadedValues(){detailData=null;detailError='';patientValueDocs.clear();patientValueKey='';}
async function reinspectImport(){
  if(!importFiles.length)return;
  rows=await inspectFiles(importFiles,state(),columns,async(id,rev)=>{const full=await archive.assessmentDetail(id);return full.revisions.find(r=>r.id===rev).document;});
  importDraft.confirmedPatientId='';importStage=2;
}
async function refreshView(announce=true){
  if(archive.snapshot.readOnly||saveFeedback?.needsCheck)fail('Zuerst die Verbindung und Bibliothek erneut prüfen.');
  await permission(archive.storage.handle,'read',true);
  const fresh=await Archive.open(archive.storage,{compact:true});
  if(fresh.snapshot.manifest.archiveId!==archive.snapshot.manifest.archiveId)fail('Eine andere Bibliothek wurde gefunden. Bibliothek erneut öffnen.');
  archive=fresh;clearLoadedValues();
  if(fresh.snapshot.readOnly){await releaseWriter();return;}
  await reinspectImport();
  if(page==='detail'&&state().assessments[currentId])detailData=await archive.assessmentDetail(currentId);
  if(announce)notice('Ansicht aktualisiert.');
}
async function enableEditing(){
  if(!$('#edit-mode-dialog').open||!$('#single-writer').checked||!validImportActor($('#session-actor').value))fail('Einzelbearbeitung bestätigen und Bearbeiterkürzel eingeben.');
  const operator=$('#session-actor').value.trim();
  if(archive.snapshot.readOnly||saveFeedback?.needsCheck)fail('Zuerst die Verbindung und Bibliothek erneut prüfen.');
  await permission(archive.storage.handle,'readwrite',true);lockError='';
  await lockFor(archive.snapshot.manifest.archiveId);
  if(!writer){lockError='Bearbeiten ist nicht verfügbar: Ein anderer Tab bearbeitet die Bibliothek bereits oder der Browser unterstützt die Schreibsperre nicht. Nur ansehen bleibt möglich.';return;}
  try{await refreshView(false);if(!writer||archive.snapshot.readOnly||saveFeedback?.needsCheck)fail('Die Bibliothek muss vor dem Bearbeiten geprüft werden.');singleWriter=true;sessionActor=operator;importDraft.actor=operator;return true;}catch(error){await releaseWriter();throw error;}
}
async function stopEditing(){
  resetImport();await releaseWriter();lockError='';
}
async function checkConnection(reselect=false){
  const previous=archive,feedback=saveFeedback;
  // Selection is optional: normal reconnect reuses the currently selected folder.
  const storage=reselect?await pick('read'):previous.storage;
  await permission(storage.handle,'read',true);
  busyMessage='Verbindung und gespeicherte Dateien prüfen…';if($('.busybar'))$('.busybar').textContent=busyMessage;
  try{
    const candidate=new Archive(storage,previous.snapshot);
    const result=await recheckConnection(candidate,feedback?.attempt,message=>{if($('.busybar'))$('.busybar').textContent=message;});
    await releaseWriter();lockError='';archive=result.archive;sourceFolderName=storage.handle.name;clearLoadedValues();
    const safe=!archive.snapshot.readOnly&&(!feedback?.attempt||result.outcome!=='uncertain');
    if(!safe){saveFeedback={...feedback,outcome:'uncertain',needsCheck:true,message:'Die Prüfung konnte keinen eindeutigen Speicherstand bestätigen. Bitte unter „Sicherung & Hilfe“ die Hinweise prüfen oder IT hinzuziehen.'};return;}
    if(feedback?.attempt&&result.outcome==='saved'){
      clearDrafts(feedback.draftKeys??[]);
      saveFeedback={...feedback,outcome:'saved',recovered:true,needsCheck:false,dismissAt:null,message:'Die erneute Prüfung bestätigt: Ihre Änderung ist vollständig gespeichert.',details:''};
      if(feedback.receipt&&feedback.needsCheck){lastImportReceipt=feedback.receipt;resetImport();page='complete';}
    }else if(feedback){saveFeedback={...feedback,outcome:'not-saved',needsCheck:false,message:'Im jetzt geprüften Bibliotheksstand wurde diese Änderung nicht gespeichert. Angaben und Dateien vor einem neuen Versuch erneut prüfen.',details:''};await reinspectImport();}
    else{saveFeedback=null;await reinspectImport();notice('Verbindung und Bibliothek vollständig geprüft.');}
    if(page==='detail'&&state().assessments[currentId])detailData=await archive.assessmentDetail(currentId);
  }catch(error){saveFeedback={...feedback,outcome:feedback?.outcome==='not-saved'?'not-saved':'uncertain',needsCheck:true,message:'Die Verbindung konnte nicht geprüft werden. Die bisherige Ansicht bleibt erhalten.',details:error.message};throw error;}
}

async function closeLibrary() {
  if(releaseLock){releaseLock();releaseLock=null;await lockCompletion;}
  clearDrafts([...drafts.entries.keys()]);sessionActor='';saveFeedback=null;lastImportReceipt=null;lockError='';archive=null;exportSelections.assessments.clear();exportSelections.patients.clear();writer=false;singleWriter=false;sourceFolderName='';selectedFolder=null;lastProbe='';probeError=null;resetImport();detailData=null;detailError='';patientValueDocs.clear();patientValueKey='';fieldQuery='';page='storage';
}
function homeView(){
  if(!archive)return `<section class="card home-welcome" id="home-empty"><div class="eyebrow">Digitale NPT · Archiv</div><h1>Willkommen im NPT-Archiv</h1><p class="muted">Öffnen Sie Ihre Bibliothek, um Patienten und Untersuchungen zu sehen.</p><button class="primary" data-nav="storage">Bibliothek öffnen</button>${folderAccessNotice()}</section>`;
  const assessments=Object.values(state().assessments),patientCount=patients().length,excluded=assessments.filter(isExcluded).length;
  return `<div class="heading"><div><div class="eyebrow">${escape(sourceFolderName)}</div><h1>Ihre Bibliothek im Überblick</h1></div><button class="primary" data-nav="import">＋ Importieren</button></div><div class="home-statistics" id="home-overview"><button class="card home-stat" data-home-view="patients"><span>Patienten</span><strong id="home-patient-count">${patientCount.toLocaleString('de-DE')}</strong><small>Patienten ansehen →</small></button><button class="card home-stat" data-home-view="assessments"><span>Untersuchungen</span><strong id="home-assessment-count">${assessments.length.toLocaleString('de-DE')}</strong><small>${excluded?`${excluded.toLocaleString('de-DE')} ausgeschlossen · `:''}Untersuchungen ansehen →</small></button></div><p class="quiet">${archive.snapshot.readOnly?'Zuletzt lesbarer Stand. Bitte die Bibliothek prüfen.':'Gesamter Bestand, einschließlich ausgeschlossener Untersuchungen.'}</p>${statisticsView(state(),statisticsSettings)}`;
}

function storageView() {
  if(archive)return `<section class="card" id="active-library"><h1>Eine Bibliothek ist bereits geöffnet</h1><dl class="provenance section-spacer"><dt>Ausgewählter Ordner</dt><dd class="filename"><strong>${escape(sourceFolderName)}</strong></dd></dl><button id="close-library">Bibliothek schließen</button></section>`;
  return `<section class="card"><div class="actions"><button id="open-folder" class="primary" ${!canOpen(c)||busy?'disabled':''}>Meine Bibliothek öffnen</button><button id="create-folder" ${!canOpen(c)||busy?'disabled':''}>Neue Bibliothek anlegen</button></div>${folderAccessNotice()}</section>
  ${selectedFolderCard('import')}
  ${selectedFolder?`<section class="card"><h2>Ausgewählten Ordner prüfen (optional)</h2><button id="probe-folder" ${!canOpen(c)||busy?'disabled':''}>Schreib- und Leseprüfung starten</button>${busy&&probeProgress?`<p role="status" class="quiet section-spacer">${escape(probeProgress)}…</p>`:''}${lastProbe?`<div class="note good">${escape(lastProbe)}</div>`:''}${probeError?`<div class="note error" role="alert"><strong>${escape(probeError.message)}</strong><details><summary>Technische Einzelheiten</summary><pre>${escape(probeError.details||'')}</pre></details></div>`:''}</section>`:''}`;
}

function exportCheckbox(kind,id,label,context='') {
  return `<input type="checkbox" id="${context}export-${kind}-${id}" data-export-kind="${kind}" data-export-id="${id}" aria-label="${escape(label)} für CSV auswählen" ${exportSelections[kind].has(id)?'checked':''}>`;
}
function exportButton(kind) {
  return `<button data-export-csv="${kind}" ${!exportSelections[kind].size||archive.snapshot.readOnly||busy?'disabled':''}>Exportiere als CSV</button>`;
}
function exportSelectionBar(kind) {
  const ids=viewExportIds[kind],selected=exportSelections[kind],visible=new Set(ids),hidden=[...selected].filter(id=>!visible.has(id)).length;
  return `<div class="export-selection"><label class="check"><input type="checkbox" id="export-all-${kind}" data-export-all="${kind}" ${!ids.length?'disabled':''} ${ids.length&&ids.every(id=>selected.has(id))?'checked':''}>Alle gefilterten Treffer auswählen (${ids.length})</label><span role="status">${selected.size} ausgewählt${hidden?` · ${hidden} außerhalb der aktuellen Filter`:''}</span>${selected.size?`<button class="link" data-export-clear="${kind}">Auswahl aufheben</button>`:''}</div>`;
}
async function downloadCsv(kind,ids) {
  await permission(archive.storage.handle,'read',true);
  const progress=(done,total)=>{busyMessage=done?`CSV vorbereiten · ${done} von ${total} Untersuchungen`:'CSV vorbereiten · Bibliothek prüfen…';if($('.busybar'))$('.busybar').textContent=busyMessage;};progress(0,0);
  let result;
  try {result=await exportArchiveCsv(archive,kind,ids,progress);}
  catch(error){if(error.requiresArchiveCheck){archive.snapshot.readOnly=true;archive.snapshot.issues.push({severity:'error',path:'CSV-Export',message:error.message});}throw error;}
  const url=URL.createObjectURL(new Blob(result.chunks,{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download=`NPT-Archiv-${kind==='patients'?'Patienten':'Untersuchungen'}-${new Date().toISOString().slice(0,10)}.csv`;link.rel='noopener';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  notice(`CSV erstellt: ${result.count} Untersuchungen, davon ${result.excluded} ausgeschlossen.`);
}

function updateAssignmentSuggestions(){
  const input=$('#reassign-patient'),value=input.value,found=patients().find(p=>p.identifier===value);
  $('#reassign-patient-matches').innerHTML=value?patients().filter(p=>p.identifier.startsWith(value)).sort((a,b)=>a.identifier.localeCompare(b.identifier)).slice(0,20).map(p=>`<option value="${escape(p.identifier)}"></option>`).join(''):'';
  $('#reassign-patient-hint').textContent=!value?'Leer lassen: bewusst nicht zugeordnet.':!/^[0-9]{1,100}$/.test(value)?'Bitte nur Ziffern eingeben.':found?'Vorhandener Patient '+found.identifier+'.':'Diese Patienten-ID wird beim Speichern neu angelegt.';
}
function changesView(){
  const data=state();if(!historyCatalogs.has(data))historyCatalogs.set(data,recentChanges(data));
  const all=historyCatalogs.get(data),list=all.filter(row=>matchesHistoryFilters(row,historyFilters)),pages=Math.max(1,Math.ceil(list.length/50));historyPage=Math.min(historyPage,pages-1);
  const dateFilters=[['editFrom','Bearbeitet ab'],['editTo','Bearbeitet bis'],['assessmentFrom','Untersuchung ab'],['assessmentTo','Untersuchung bis']];
  return `<div class="heading"><h1>Neueste Änderungen</h1></div><section class="card"><div class="history-filters">${dateFilters.map(([key,label])=>`<label>${label}<input id="history-${key}" type="date" data-history-filter="${key}" value="${escape(historyFilters[key])}"></label>`).join('')}<label>iMed Patienten-ID<input id="history-patient-id" type="search" inputmode="numeric" maxlength="100" data-history-filter="patientId" value="${escape(historyFilters.patientId)}" placeholder="ID oder Teil der ID"></label></div>${!validHistoryFilters(historyFilters)?'<p class="note error section-spacer" role="alert">Bitte gültige Datumsbereiche angeben: „ab“ muss vor oder am „bis“-Datum liegen.</p>':''}${Object.values(historyFilters).some(Boolean)?'<button id="clear-history-filters" class="section-spacer">Filter zurücksetzen</button>':''}</section>
  <p class="result-count">${list.length} von ${all.length} Änderungen · neueste zuerst</p>${list.length?`<div class="table-wrap"><table class="changes-table"><thead><tr><th>Bearbeitet</th><th>Patient / Aufenthalt</th><th>Untersuchung</th><th>Änderung</th><th></th></tr></thead><tbody>${list.slice(historyPage*50,(historyPage+1)*50).map(row=>`<tr data-change-id="${escape(row.id)}"><td><strong>${row.editDate?escape(new Date(row.createdAt).toLocaleString('de-DE')):'Datum unbekannt'}</strong><small>${escape(row.actor||'Ohne Bearbeiterkürzel')}</small></td><td><strong>${escape(row.patientLabel)}</strong>${row.stayId?`<small>Aufenthalt ${escape(row.stayId)}</small>`:''}</td><td>${row.assessmentDate?fmtDate(row.assessmentDate):'—'}</td><td><strong>${escape(row.label)}</strong>${row.file?`<small class="filename">${escape(row.file.name)}</small>`:''}${row.reason?`<details><summary>Grund ansehen</summary><p class="source-note">${escape(row.reason)}</p></details>`:''}</td><td><div class="actions">${row.assessmentId&&data.assessments[row.assessmentId]?`<button class="link" data-detail="${row.assessmentId}">Untersuchung ansehen</button>`:row.patientId&&data.patients[row.patientId]?`<button class="link" data-patient="${row.patientId}">Patient ansehen</button>`:''}${row.file?row.file.kind==='pdf'?`<button class="link" data-report="${row.file.id}">PDF öffnen</button>`:`<button class="link" data-download="${row.file.id}">CSV herunterladen</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>${pages>1?`<div class="actions section-spacer"><button id="history-previous" ${historyPage===0?'disabled':''}>← Zurück</button><span>Seite ${historyPage+1} / ${pages}</span><button id="history-next" ${historyPage===pages-1?'disabled':''}>Weiter →</button></div>`:''}`:'<section class="card empty"><h2>Keine passenden Änderungen</h2></section>'}`;
}
function clinicalFilterInputs(){
  const age=parseAgeRange(clinicalFilters.age);
  return `<div class="clinical-filters section-spacer"><h3>Diagnose & Alter</h3><div class="grid2"><label>Diagnose enthält<input id="filter-diagnosis" data-clinical-filter="diagnosis" type="search" maxlength="2000" value="${escape(clinicalFilters.diagnosis)}" placeholder="Diagnose suchen"></label><label>Diagnosesicherheit<select data-clinical-filter="diagnosisStatus">${option('','Alle',clinicalFilters.diagnosisStatus)}${DIAGNOSIS_STATUSES.map(([key,label])=>option(key,label,clinicalFilters.diagnosisStatus)).join('')}</select></label><label>Demenz-Typ enthält<input id="filter-dementia" data-clinical-filter="dementiaType" type="search" maxlength="200" value="${escape(clinicalFilters.dementiaType)}" placeholder="Demenz-Typ suchen"></label><label>Betroffene Hemisphäre<select data-clinical-filter="affectedHemisphere">${option('','Alle',clinicalFilters.affectedHemisphere)}${HEMISPHERES.map(([key,label])=>option(key,label,clinicalFilters.affectedHemisphere)).join('')}</select></label><label>Alter bei Untersuchung<input id="filter-age" data-clinical-filter="age" type="text" maxlength="100" value="${escape(clinicalFilters.age)}" placeholder="z. B. 18–65 oder ≥65" aria-invalid="${!age.valid}" aria-describedby="age-filter-hint"></label></div><p id="age-filter-hint" class="${age.valid?'quiet':'note error'}" ${age.valid?'':'role="alert"'}>${age.valid?'Alter aus der gewählten CSV-Fassung. Beispiele: 18–65, ≥65, <18 oder 70. Ohne Altersangabe kein Treffer bei aktivem Altersfilter.':'Bitte einen gültigen Altersbereich eingeben, z. B. 18–65 oder ≥65.'}</p></div>`;
}
function clinicalChips(){
  const labels={diagnosis:'Diagnose',diagnosisStatus:'Diagnosesicherheit',dementiaType:'Demenz-Typ',affectedHemisphere:'Hemisphäre',age:'Alter'};
  return Object.entries(clinicalFilters).filter(([,value])=>value).map(([key,value])=>`<button data-clear-clinical-filter="${key}" aria-label="${labels[key]} zurücksetzen">${labels[key]}: ${escape(key==='diagnosisStatus'?diagnosisStatusLabel(value):key==='affectedHemisphere'?hemisphereLabel(value):value)} <span aria-hidden="true">×</span></button>`).join('');
}
function clinicalInputs(value,type,prefix,{preserveOther=false,disabled=false,showDementia=false,showHemisphere=false}={}){
  const clinical={...emptyClinical(),...value};
  return `<fieldset class="clinical-inputs" ${disabled?'disabled':''}><legend class="sr-only">Klinische Angaben</legend><label>Diagnose<textarea id="${prefix}-diagnosis" data-clinical-field="diagnosis" maxlength="2000" rows="2" placeholder="Diagnose eingeben (optional)">${escape(clinical.diagnosis)}</textarea></label><div class="diagnosis-status section-spacer" role="group" aria-label="Diagnosesicherheit">${DIAGNOSIS_STATUSES.map(([key,label])=>`<label class="check"><input type="checkbox" data-diagnosis-status="${key}" ${clinical.diagnosisStatus===key?'checked':''}>${label}</label>`).join('')}</div>${showDementia||type==='memory-clinic'||preserveOther&&clinical.dementiaType?`<label class="section-spacer">Demenz-Typ<input id="${prefix}-dementia" data-clinical-field="dementiaType" maxlength="200" value="${escape(clinical.dementiaType)}" placeholder="Demenz-Typ eingeben (optional)"></label>`:''}${showHemisphere||isEpilepsy(type)||preserveOther&&clinical.affectedHemisphere?`<label class="section-spacer">Betroffene Hemisphäre<select id="${prefix}-hemisphere" data-clinical-field="affectedHemisphere">${option('','Nicht angegeben',clinical.affectedHemisphere??'')}${HEMISPHERES.map(([key,label])=>option(key,label,clinical.affectedHemisphere)).join('')}</select></label>`:''}</fieldset>`;
}
function clinicalSummary(value){
  const c={...emptyClinical(),...value};
  return `<dl class="provenance"><dt>Diagnose</dt><dd class="imported-value-text">${escape(c.diagnosis??'Nicht angegeben')}</dd><dt>Diagnosesicherheit</dt><dd>${escape(diagnosisStatusLabel(c.diagnosisStatus))}</dd>${c.dementiaType?`<dt>Demenz-Typ</dt><dd>${escape(c.dementiaType)}</dd>`:''}${c.affectedHemisphere?`<dt>Betroffene Hemisphäre</dt><dd>${escape(hemisphereLabel(c.affectedHemisphere))}</dd>`:''}</dl>`;
}
function readClinicalForm(form,base){
  const value={...base};for(const input of form.querySelectorAll('[data-clinical-field]'))value[input.dataset.clinicalField]=input.value;
  value.diagnosisStatus=form.querySelector('[data-diagnosis-status]:checked')?.dataset.diagnosisStatus??null;
  return clinicalFromInputs(value);
}
function assessmentClinicalView(a){
  const c=clinicalOf(a);
  const visibility={},pending=drafts.entries.get(`clinical:${a.id}`);
  for(const [key,id] of [['dementiaType','edit-dementia'],['affectedHemisphere','edit-hemisphere']]){
    const local=pending?.values.find(value=>value.key===id),base=pending?.baseline.find(value=>value.key===id);
    if(local&&local.value!==base?.value&&local.value)visibility[key==='dementiaType'?'showDementia':'showHemisphere']=true;
  }
  return `<section class="card" id="assessment-clinical"><h2>Klinische Angaben</h2>${clinicalSummary(c)}<details id="clinical-editor" class="section-spacer"><summary>Klinische Angaben bearbeiten</summary><form id="clinical-edit-form" class="section-spacer">${clinicalInputs(c,a.assessmentTypeId,'edit',{preserveOther:true,disabled:!writable(),...visibility})}<button type="submit" class="primary section-spacer" ${!writable()?'disabled':''}>Angaben speichern</button></form></details></section>`;
}
function assessmentsView() {
  const all=Object.values(state().assessments);
  const list=all.filter(a=>{
    const d=selectedRevision(a)?.document;
    const hay=[patientText(a.patientId),a.stayId,a.sessionId,assessmentTypeLabel(a.assessmentTypeId),d?.date,d?.dateText,sourceValue(d,'demographics_examiner_initials'),JSON.stringify(d?.normalized)].join(' ').toLocaleLowerCase('de');
    return (!query||hay.includes(query.toLocaleLowerCase('de')))&&matchesAssessmentType(a,filterType)&&matchesArchiveStatus(a,filterStatus)&&(!measure||hasPerformanceValue(d,measure))&&matchesClinicalFilters(a,d,clinicalFilters);
  }).sort((a,b)=>(selectedRevision(b)?.document.date??'').localeCompare(selectedRevision(a)?.document.date??'')||a.id.localeCompare(b.id));
  const totalPages=Math.max(1,Math.ceil(list.length/50));listPage=Math.min(listPage,totalPages-1);const visible=list.slice(listPage*50,(listPage+1)*50);
  viewExportIds.assessments=list.map(a=>a.id);
  return `<div class="heading"><div><h1>Untersuchungen</h1></div><div class="actions">${exportButton('assessments')}<button class="primary" data-nav="import">＋ Importieren</button></div></div>
  <div class="toolbar"><label>Suchen<input id="search" type="search" value="${escape(query)}" placeholder="iMed Patienten-ID, Aufenthalt oder Datum"></label><label>Untersuchungsart<select id="assessment-type-filter">${typeOptions(filterType,true)}</select></label><label>Archivstatus<select id="archive-status-filter">${option('included','Eingeschlossen',filterStatus)}${option('excluded','Nur ausgeschlossene',filterStatus)}${option('all','Alle Untersuchungen',filterStatus)}</select></label></div>
  ${fieldFilter()}
  ${query||filterType||measure||filterStatus!=='included'||Object.values(clinicalFilters).some(Boolean)?`<div class="filter-chips" aria-label="Aktive Filter">${query?`<button data-clear-filter="search" aria-label="Suche zurücksetzen">Suche: ${escape(query)} <span aria-hidden="true">×</span></button>`:''}${filterType?`<button data-clear-filter="type" aria-label="Untersuchungsart zurücksetzen">${escape(filterType==='unassigned'?'Noch nicht zugeordnet':assessmentTypeLabel(filterType))} <span aria-hidden="true">×</span></button>`:''}${measure?`<button data-clear-filter="field" aria-label="Feldfilter zurücksetzen">${escape(fieldLabel(measure))} <span aria-hidden="true">×</span></button>`:''}${clinicalChips()}${filterStatus!=='included'?`<button data-clear-filter="status" aria-label="Archivstatus zurücksetzen">${filterStatus==='excluded'?'Nur ausgeschlossene':'Alle Untersuchungen'} <span aria-hidden="true">×</span></button>`:''}</div>`:''}
  ${exportSelectionBar('assessments')}
  <p class="result-count section-spacer">${list.length} von ${all.length} Untersuchungen</p>${list.length?`<div class="table-wrap"><table><thead><tr><th class="selection-cell"><span class="sr-only">Für Export auswählen</span></th><th>Patient / Aufenthalt</th><th>Untersuchung</th><th>Untersuchungsart</th><th>Berichte</th><th></th></tr></thead><tbody>${visible.map(a=>{const d=selectedRevision(a)?.document;return `<tr class="${exportSelections.assessments.has(a.id)?'export-selected':''}"><td class="selection-cell">${exportCheckbox('assessments',a.id,titleOf(a))}</td><td><strong>${escape(patientText(a.patientId))}</strong><small>Aufenthalt ${escape(a.stayId)}</small></td><td><strong>${fmtDate(d?.date)}</strong><small>${escape(d?.timeText||'Uhrzeit nicht angegeben')} · ${escape(sourceValue(d,'demographics_examiner_initials')||'Untersucher nicht angegeben')}</small>${a.revisions.length>1?pill(`${a.revisions.length} Fassungen`,'warn'):''}${isExcluded(a)?pill('Ausgeschlossen','warn'):''}</td><td class="assessment-type">${escape(assessmentTypeLabel(a.assessmentTypeId))}</td><td>${reportActions(a)}</td><td><button class="link" data-detail="${a.id}">Ansehen →</button></td></tr>`;}).join('')}</tbody></table></div>${totalPages>1?`<div class="actions section-spacer"><button id="list-previous" ${listPage===0?'disabled':''}>← Zurück</button><span>Seite ${listPage+1} / ${totalPages}</span><button id="list-next" ${listPage===totalPages-1?'disabled':''}>Weiter →</button></div>`:''}`:`<section class="card empty"><div class="empty-icon">▤</div><h2>${all.length?'Keine passenden Untersuchungen':'Beginnen Sie mit Ihren ersten Exportdateien'}</h2><p class="muted">${all.length?'Passen Sie Suche oder Filter an.':'CSV und PDF auswählen, zuordnen und gemeinsam speichern.'}</p>${!all.length?'<button data-nav="import" class="primary">Dateien übernehmen</button>':'<button id="clear-filters">Filter zurücksetzen</button>'}</section>`}`;
}
function importView() {
  const plan=planPatientImport(rows,state(),importDraft);
  const fileIssues=plan.issues.filter(i=>i.rowId);
  const revisions=rows.filter(r=>r.kind==='csv'&&r.status==='revision'&&!r.error);
  const exceptions=rows.filter(r=>r.error||fileIssues.some(i=>i.rowId===r.id)||revisions.includes(r));
  const fieldIssues=plan.issues.filter(i=>!i.rowId&&i.code!=='patient-confirmation');
  return `<div class="heading"><div><h1>Importieren</h1>${importStage===1&&plan.patient?`<p class="muted" id="import-patient-context">Für Patient <strong>${escape(plan.patient.identifier)}</strong></p>`:''}</div></div>
  <ol class="import-steps" aria-label="Importschritte">${['Dateien auswählen','Patient & Aufenthalt','Klinische Angaben','Speichern'].map((name,i)=>`<li class="${importStage===i+1?'current':importStage>i+1?'done':''}"><button data-import-stage="${i+1}" ${importStage===i+1?'aria-current="step"':''} ${i>0&&!rows.length||i>1&&!plan.ready?'disabled':''}><b aria-hidden="true">${importStage>i+1?'✓':i+1}</b> ${name}</button></li>`).join('')}</ol>
  ${importStage===1?`<section class="card"><h2>1 · Dateien für einen Patienten auswählen</h2><div id="drop-zone" class="file-picker"><strong>CSV und PDF hier ablegen</strong><label>Oder Dateien auswählen<input id="import-files" type="file" accept=".csv,.pdf" multiple ${!writable()?'disabled':''}></label></div><details><summary>Welche Dateien sind möglich?</summary><p class="quiet section-spacer">CSV und PDF für einen Patienten und einen Aufenthalt · bis 100 Dateien / 128 MiB insgesamt, 32 MiB pro Datei, CSV bis 8 MiB. iPad-Vollbackups werden noch nicht unterstützt.</p></details>${rows.length?'<button class="primary section-spacer" data-import-stage="2">Weiter →</button>':''}</section>`:''}
  ${importStage===2?`<section class="card"><h2>2 · Patient und Aufenthalt</h2><form id="patient-import-form"><div class="form-row"><label>iMed Patienten-ID<input id="import-patient-id" name="identifier" inputmode="numeric" pattern="[0-9]+" maxlength="100" required value="${escape(importDraft.identifier)}" placeholder="z. B. 00012345"></label><label>Aufenthalts-ID<input id="import-stay-id" inputmode="numeric" pattern="[0-9]+" maxlength="100" required value="${escape(importDraft.stayId)}" placeholder="z. B. 0006789"></label></div>
  ${plan.csvCount?`<label class="section-spacer">Untersuchungsart<select id="import-assessment-type">${typeOptions(importDraft.assessmentTypeId)}</select></label>`:''}
  ${plan.patient?`<div class="note ${importDraft.confirmedPatientId===plan.patient.id?'good':''}" id="existing-import-patient"><strong>Patient ${escape(plan.patient.identifier)} ist bereits vorhanden.</strong><p class="section-spacer">${plan.previous.length} bisherige ${plan.previous.length===1?'Untersuchung':'Untersuchungen'}</p>${plan.previous.length?`<ul class="previous-sessions">${plan.previous.map(a=>`<li>${fmtDate(selectedRevision(a)?.document.date)} · Aufenthalt ${escape(a.stayId)}${isExcluded(a)?' · ausgeschlossen':''}</li>`).join('')}</ul>`:''}${importDraft.confirmedPatientId===plan.patient.id?'<strong>Hinzufügen zu diesem Patienten bestätigt.</strong>':`<button id="confirm-import-patient" type="button">Zu diesem Patienten hinzufügen</button>`}</div>`:/^[0-9]{1,100}$/.test(importDraft.identifier)?'<p class="quiet section-spacer">Diese Patienten-ID wird beim Import neu angelegt.</p>':''}
  <p class="quiet section-spacer">${plan.csvCount} CSV · ${plan.pdfCount} PDF${plan.duplicateCount?` · ${plan.duplicateCount} bereits vorhanden oder doppelt ausgewählt`:''}</p>
  <div class="actions"><button type="button" data-import-stage="1">← Dateien ändern</button><button type="submit" id="review-import" class="primary" ${!writable()||!plan.ready?'disabled':''}>Weiter →</button></div></form></section>
  ${exceptions.length?`<section class="card"><h2>Bitte kurz prüfen</h2>${exceptions.map(row=>`<article class="import-item" data-row="${row.id}"><strong class="filename">${escape(row.name)}</strong>${fileIssues.filter(i=>i.rowId===row.id).map(i=>`<div class="note error" role="alert">${escape(i.message)}</div>`).join('')}
  ${row.kind==='csv'&&row.status==='revision'?`<p class="quiet section-spacer">${row.equivalent?'Die Werte sind gleich, die Datei wurde anders exportiert.':`${row.changes?.length??0} Quellfelder unterscheiden sich von der gespeicherten Fassung.`}${row.contextConflict?' Datum oder Patientendaten aus dem Export weichen ab.':''}</p><label>Geänderte CSV<select data-revision-field="action">${option('','Bitte auswählen',row.action)}${option('keep','Als Fassung ergänzen; bisherige anzeigen',row.action)}${option('select','Als Fassung ergänzen und künftig anzeigen',row.action)}${option('separate','Als getrennte Untersuchung anlegen',row.action)}</select></label>${row.matches.length>1?`<label class="section-spacer">Bisherige Untersuchung<select data-revision-field="target">${option('','Bitte auswählen',row.target)}${row.matches.map(id=>option(id,titleOf(state().assessments[id]),row.target)).join('')}</select></label>`:''}<label class="section-spacer">Grund für die neue Fassung oder getrennte Untersuchung<textarea data-revision-field="note" maxlength="2000">${escape(row.note)}</textarea></label><details><summary>Geänderte Felder</summary><pre>${escape((row.changes||[]).join('\n')||'Keine Wertunterschiede erkannt.')}</pre></details>`:''}
  ${/\.pdf$/i.test(row.name)?`<label class="section-spacer">Passende PDF auswählen<input type="file" accept=".pdf" data-replace-pdf="${row.id}"></label><label class="section-spacer">Zugehörige CSV hinzufügen<input type="file" accept=".csv" data-add-csv></label>`:''}
  <button class="link section-spacer" data-remove-import-file="${row.id}">Datei aus diesem Import entfernen</button></article>`).join('')}</section>`:''}
  ${!plan.ready&&fieldIssues.length?`<p class="quiet" role="status">${fieldIssues.map(i=>escape(i.message)).join(' ')}</p>`:''}`:''}
  ${importStage===3?`<section class="card" id="import-clinical"><h2>3 · Klinische Angaben</h2>${plan.rows.some(r=>r.kind==='csv'&&['new','separate'].includes(r.action))?`<p class="quiet">Optional · gilt für alle neuen Untersuchungen dieses Imports. Sie können die Angaben später ergänzen.</p><form id="clinical-import-form">${clinicalInputs(importDraft.clinical,importDraft.assessmentTypeId,'import',{disabled:!writable()})}<div class="actions section-spacer"><button type="button" data-import-stage="2">← Zurück</button><button id="review-clinical" type="submit" class="primary" ${!writable()||!plan.ready?'disabled':''}>Weiter →</button></div></form>`:`<p>Vorhandene klinische Angaben bleiben erhalten. Sie können diese in der einzelnen Untersuchung bearbeiten.</p><div class="actions"><button data-import-stage="2">← Zurück</button><button id="review-clinical" data-import-stage="4" class="primary" ${!writable()||!plan.ready?'disabled':''}>Weiter →</button></div>`}</section>`:''}
  ${importStage===4?`<section class="card"><h2>4 · Import speichern</h2><dl class="provenance"><dt>iMed Patienten-ID</dt><dd><strong>${escape(importDraft.identifier||'Bitte eingeben')}</strong></dd><dt>Aufenthalts-ID</dt><dd>${escape(importDraft.stayId||'Bitte eingeben')}</dd>${plan.csvCount?`<dt>Untersuchungsart</dt><dd>${escape(assessmentTypeLabel(importDraft.assessmentTypeId||plan.rows.find(r=>r.kind==='csv')?.assessmentTypeId))}</dd>`:''}<dt>Dateien</dt><dd>${plan.csvCount} CSV · ${plan.pdfCount} PDF</dd></dl>${plan.rows.some(r=>r.kind==='csv')?`<ul>${plan.rows.filter(r=>r.kind==='csv').map(r=>`<li>Untersuchung vom ${fmtDate(r.document.date)}</li>`).join('')}</ul>`:''}${plan.duplicateCount?`<p class="quiet">${plan.duplicateCount} bereits vorhandene oder doppelte Dateien werden übersprungen.</p>`:''}
  ${plan.rows.some(r=>r.kind==='csv'&&['new','separate'].includes(r.action))?clinicalSummary(clinicalForNewAssessment(importDraft.clinical,importDraft.assessmentTypeId)):''}${plan.issues.length?`<div class="note error">${plan.issues.map(i=>escape(i.message)).join('<br>')}</div>`:''}<details><summary>Dateinamen ansehen</summary><ul>${plan.rows.map(r=>`<li class="filename">${escape(r.name)}</li>`).join('')}</ul></details><label class="section-spacer">Bearbeiterkürzel<input id="actor" readonly value="${escape(sessionActor)}"></label>${validImportActor(sessionActor)?'':'<p class="quiet" id="actor-hint">Bitte oben den Bearbeitungs-Modus öffnen.</p>'}<div class="actions section-spacer"><button data-import-stage="3">← Angaben ändern</button><button id="commit-import" class="primary" ${!writable()||!plan.ready||!validImportActor(sessionActor)?'disabled':''}>Importieren</button></div></section>`:''}`;
}

function reportActions(assessment){
  const reports=assessment.attachments.filter(file=>file.kind==='pdf');
  if(!reports.length)return '<span class="quiet">Kein PDF</span>';
  if(reports.length===1)return `<button class="link" data-report="${reports[0].id}" aria-label="Bericht öffnen · ${escape(titleOf(assessment))}">Bericht öffnen</button>`;
  return `<details class="report-chooser"><summary>Berichte öffnen (${reports.length})</summary><div class="report-choices">${reports.map(report=>`<button class="link filename" data-report="${report.id}">${escape(report.name)}</button>`).join('')}</div></details>`;
}
function completionView(){
  const receipt=lastImportReceipt;if(!receipt)return '<section class="card"><h1>Kein abgeschlossener Import</h1><button data-nav="import">Importieren</button></section>';
  const assessments=receipt.assessmentIds.map(id=>state().assessments[id]).filter(Boolean);
  return `<section class="card completion" id="import-complete"><div class="completion-mark" aria-hidden="true">✓</div><h1>Import abgeschlossen</h1><p>${receipt.files} Dateien in Ihrer Bibliothek gespeichert und erneut geprüft.</p><dl class="provenance"><dt>iMed Patienten-ID</dt><dd><strong>${escape(receipt.identifier)}</strong></dd><dt>Aufenthalts-ID</dt><dd>${escape(receipt.stayId)}</dd><dt>Gespeichert</dt><dd>${receipt.csvCount} CSV · ${receipt.pdfCount} PDF</dd><dt>Untersuchungen</dt><dd>${receipt.newCount} neu · ${receipt.csvCount-receipt.newCount} zusätzliche CSV-Fassungen</dd><dt>Bereits vorhanden</dt><dd>${receipt.skippedCount} Dateien übersprungen</dd><dt>Bearbeiterkürzel</dt><dd>${escape(receipt.actor)}</dd></dl><div class="actions section-spacer"><button id="next-patient" class="primary">Nächsten Patienten importieren</button><button data-nav="assessments">Alle Untersuchungen</button></div></section><section class="card"><h2>Ihre Untersuchungen</h2>${assessments.map(a=>`<div class="completion-entry"><div><strong>${fmtDate(selectedRevision(a)?.document.date)} · Aufenthalt ${escape(a.stayId)}</strong><p class="assessment-type">${escape(assessmentTypeLabel(a.assessmentTypeId))}</p></div><div class="actions"><button data-detail="${a.id}">Untersuchung ansehen</button>${reportActions(a)}</div></div>`).join('')}</section>`;
}

function originalCard(a) {
  return `<div class="cap-row"><div><strong class="filename">${escape(a.name)}</strong><small>${a.kind==='pdf'?'Originalbericht':'Originale CSV-Datei'}</small><details><summary>Herkunft der Datei</summary><p class="quiet">${escape(a.note||'Bei der Übernahme ausdrücklich zugeordnet.')}</p><p class="mono">SHA-256: ${escape(a.hash)}</p><p class="quiet">${escape(a.method)}</p></details></div><div class="actions">${a.kind==='pdf'?`<button data-report="${a.id}">Bericht ansehen</button>`:''}<button data-download="${a.id}">Herunterladen</button></div></div>`;
}
function importedFieldsView(document){
  const groups=importedFieldGroups(document);
  const versionPreview=group=>group.versionKeys.filter(key=>importedCellState(document,key)==='value').slice(0,2).map(key=>`${importedFieldLabel(key)}: ${document.raw[key].raw}`).join(' · ');
  return `<section id="assessment-data"><h2>Importierte Angaben & Testergebnisse</h2><p class="quiet">Alle ${document.headers.length} Felder der gewählten CSV-Fassung, unverändert. Versionen und Kennzeichen erscheinen so, wie sie exportiert wurden.</p>${groups.map(group=>`<details class="card imported-group" id="imported-${group.id}"><summary><span>${escape(group.label)}</span><small>${group.presentCount} von ${group.keys.length} Feldern befüllt</small>${versionPreview(group)?`<span class="source-version-preview">${escape(versionPreview(group))}</span>`:''}</summary><div class="table-wrap section-spacer"><table class="imported-values"><thead><tr><th>Angabe / Messwert</th><th>Importierter Wert</th></tr></thead><tbody>${group.keys.map(key=>{const label=importedFieldLabel(key),status=importedCellState(document,key);return `<tr data-source-field="${escape(key)}"><td><strong>${escape(label)}</strong>${label!==key?`<small class="source-field-key">${escape(key)}</small>`:''}${document.unknownFields?.includes(key)?'<small>Zusätzliches Feld aus dem Export</small>':''}</td><td>${status==='missing'||status==='absent'?'<em class="muted">Nicht überliefert</em>':status==='empty'?'<em class="muted">Leer exportiert (leere Zeichenfolge)</em>':`<div class="imported-value-text">${escape(document.raw[key].raw)}</div>`}</td></tr>`;}).join('')}</tbody></table></div></details>`).join('')}</section>`;
}

function detailView() {
  if(detailError)return `<section class="card"><h1>Untersuchung konnte nicht geöffnet werden</h1><p>${escape(detailError)}</p><button data-nav="recovery">Zur Prüfung & Hilfe</button></section>`;
  const a=detailData?.id===currentId?detailData:state().assessments[currentId];if(!a)return '<p>Untersuchung nicht gefunden.</p>';
  const r=selectedRevision(a),d=r?.document;if(d?.projected)return '<div class="card loading">Die Untersuchung wird geöffnet…</div>';
  const groups=new Map();for(const key of d?.headers??[]){const family=key.startsWith('demographics_')?'demographics':key.split('_')[0];if(!groups.has(family))groups.set(family,[]);groups.get(family).push(key);}
  return `<div class="heading"><div><div class="eyebrow">${fmtDate(d?.date)}</div><h1>${escape(patientText(a.patientId))}</h1><p class="muted">Aufenthalt ${escape(a.stayId)} · ${escape(d?.timeText||'Uhrzeit nicht angegeben')}</p><p class="assessment-type">${escape(assessmentTypeLabel(a.assessmentTypeId))}</p></div><div class="actions"><button data-nav="assessments">← Alle Untersuchungen</button>${a.patientId?`<button data-patient="${a.patientId}">Patientenverlauf ansehen</button>`:''}</div></div>
  <section class="card" id="assessment-inclusion">${isExcluded(a)?'<div class="note"><strong>Dieser Datensatz ist ausgeschlossen.</strong> Originaldateien und Verlauf bleiben erhalten.</div>':''}<button id="toggle-exclusion" ${!writable()?'disabled':''}>${isExcluded(a)?'Datensatz wieder einschließen':'Datensatz ausschließen'}</button></section>
  ${assessmentClinicalView(a)}
  <section class="card" id="assessment-reports"><div class="heading"><h2>Originalberichte</h2></div>${a.attachments.map(originalCard).join('')||'<p class="muted">Noch kein Bericht hinterlegt.</p>'}<label class="section-spacer">PDF hinzufügen<input id="assessment-pdf" type="file" accept=".pdf" ${!writable()?'disabled':''}></label><p id="assessment-pdf-error" class="note error section-spacer" role="alert" ${assessmentPdfError?.id===a.id?'':'hidden'}>${escape(assessmentPdfError?.id===a.id?assessmentPdfError.message:'')}</p></section>
  ${importedFieldsView(d)}
  <div class="grid2"><details class="card"><summary>Zuordnung ändern</summary><form id="assignment-form"><label>iMed Patienten-ID<input id="reassign-patient" type="text" inputmode="numeric" pattern="[0-9]+" maxlength="100" list="reassign-patient-matches" autocomplete="off" value="${escape(state().patients[a.patientId]?.identifier??'')}" aria-describedby="reassign-patient-hint"></label><datalist id="reassign-patient-matches"></datalist><p id="reassign-patient-hint" class="quiet section-spacer"></p><label class="section-spacer">Aufenthalts-ID<input id="reassign-stay" inputmode="numeric" value="${escape(a.stayId)}" maxlength="100"></label><label class="section-spacer">Untersuchungsart<select id="reassign-type">${typeOptions(a.assessmentTypeId??'')}</select></label><label class="section-spacer">Grund für die Änderung<textarea id="reassign-reason" maxlength="2000"></textarea></label><button id="save-assignment" type="submit" class="section-spacer" ${!writable()?'disabled':''}>Änderung speichern</button></form></details>
  <details class="card"><summary>CSV-Dateien & Fassungen (${a.revisions.length})</summary><p class="quiet section-spacer">Alle Fassungen bleiben erhalten.</p><form id="revision-form"><label>Für die Anzeige ausgewählte Fassung<select id="selected-revision">${a.revisions.map((v,i)=>option(v.id,`${i+1} · ${v.original.name} · ${v.reason}`,a.selectedRevisionId)).join('')}</select></label><button id="select-revision" type="button" class="section-spacer" ${!writable()?'disabled':''}>Fassung auswählen</button></form>${a.revisions.map(v=>originalCard(v.original)).join('')}</details></div>
  <details class="card"><summary>Technische Originalansicht (${d?.headers.length??0} Felder)</summary><p class="quiet section-spacer">„Nicht überliefert“ und eine exportierte leere Zeichenfolge bleiben verschieden. Unbekannte Felder und exportierte Bewertungs-/Variantenversionen sind erhalten.</p>${[...groups].map(([family,keys])=>`<details><summary>${escape(family.toUpperCase())} · ${keys.length} Felder</summary><div class="table-wrap section-spacer"><table class="value-table"><thead><tr><th>Originalfeld</th><th>Originalwert</th><th>Zellstatus</th></tr></thead><tbody>${keys.map(key=>{const cell=d.raw[key];return `<tr><td>${escape(key)}</td><td>${cell.missing?'<em class="muted">Nicht überliefert</em>':cell.raw===''?'<em class="muted">Leere Zeichenfolge</em>':escape(cell.raw)}</td><td>${cell.missing?'Unquotiert leer':cell.quoted?'Quotiert':'Text'}${d.unknownFields.includes(key)?' · unbekanntes Feld':''}</td></tr>`;}).join('')}</tbody></table></div></details>`).join('')}</details>
  <details class="card"><summary>Änderungsverlauf & Herkunft</summary><dl class="provenance section-spacer"><dt>Quellsitzung</dt><dd class="mono">${escape(a.sessionId)}</dd><dt>Erzeugerversion</dt><dd>${escape(d?.producerVersion??'Im CSV nicht angegeben')}</dd><dt>Importadapter</dt><dd>${escape(d?.parserVersion)}</dd><dt>Originaldatum</dt><dd>${escape(d?.dateText||'Nicht angegeben')}</dd><dt>Zeitzone</dt><dd>Im CSV nicht angegeben</dd></dl>${state().history.filter(h=>h.operations.some(o=>o.assessmentId===a.id||o.assessment?.id===a.id)).map(h=>`<div class="history-entry"><strong>${escape(h.createdAt)}</strong><small>${escape(h.actor||'Ohne Bearbeiterkürzel')}</small>${h.operations.filter(o=>o.assessmentId===a.id||o.assessment?.id===a.id).map(o=>`<p class="quiet">${escape(({ 'assessment.create':'Untersuchung angelegt','revision.add':'Quelldatei/Fassung hinzugefügt','revision.select':'Anzeigefassung ausgewählt','patient.link':'Patientenzuordnung geändert','stay.update':'Aufenthalts-ID geändert','assessment.type.set':'Untersuchungsart zugeordnet','assessment.clinical.set':'Klinische Angaben gespeichert','assessment.exclusion.set':o.excluded?'Datensatz ausgeschlossen':'Datensatz wieder eingeschlossen','attachment.add':'Bericht ergänzt','attachment.link':'Bericht zugeordnet' })[o.type]||'Eintrag ergänzt')} ${escape(o.reason||o.revision?.reason||'')}${o.assessmentTypeId?' · '+escape(assessmentTypeLabel(o.assessmentTypeId)):''}</p>${o.type==='assessment.clinical.set'?clinicalSummary(o.clinical):''}`).join('')}</div>`).join('')}</details>`;
}

let comparisonKey = '';
function startPatientImport(id){
  const patient=state()?.patients[id];if(!patient)fail('Patient nicht gefunden.');
  resetImport();importDraft.identifier=patient.identifier;lastImportReceipt=null;page='import';render();window.scrollTo({top:0});
}
function selectPatient(id) {
  const patient=state().patients[id];if(!patient)return;
  currentPatient=id;patientQuery=patient.identifier;patientResultsOpen=false;comparisonKey='';comparisonQuery='';patientValueDocs.clear();patientValueKey='';page='patients';render();$('#patient-history-heading')?.focus({preventScroll:true});
}
function setPatientResultsOpen(open) {
  patientResultsOpen=open;const panel=$('#patient-search-results');if(panel)panel.hidden=!open;
}
function comparisonTable(visits,keys){
  if(!keys.length)return '<p class="quiet section-spacer">Keine passenden Messwerte. Bitte die Suche ändern.</p>';
  const groups=groupedMeasurementFields(keys),units=new Map(SUMMARY_MEASURES.map(([key,,unit])=>[key,unit]));
  return `<div class="table-wrap section-spacer comparison-scroll" tabindex="0" role="region" aria-label="Vergleich der gewählten Messwerte"><table class="comparison-matrix"><thead><tr><th scope="col">Messwert</th>${visits.map(a=>`<th scope="col" class="comparison-session">${fmtDate(patientValueDocs.get(a.id)?.date)}<small>Aufenthalt ${escape(a.stayId)}</small></th>`).join('')}</tr></thead>${groups.map(group=>`<tbody aria-label="${escape(group.label)}"><tr class="comparison-group"><th scope="rowgroup" colspan="${visits.length+1}">${escape(group.label)}</th></tr>${group.fields.map(key=>`<tr data-comparison-field="${escape(key)}"><th scope="row"><strong>${escape(importedFieldLabel(key))}</strong><small class="source-field-key">${escape(key)}</small>${units.has(key)?`<small>${escape(units.get(key))}</small>`:''}</th>${visits.map(a=>{
    const doc=patientValueDocs.get(a.id),cell=doc?.raw&&Object.hasOwn(doc.raw,key)?doc.raw[key]:null,present=cell&&!cell.missing&&cell.raw!=='',hints=performanceContext(doc,key).filter(text=>text!=='Durchführung/Vollständigkeit aus diesem Wert allein nicht gesichert');
    return `<td data-comparison-assessment="${a.id}"><strong class="comparison-value">${present?escape(cell.raw):'—'}</strong>${present&&!isNumericSourceValue(cell.raw)?'<small>Kein numerischer Wert in dieser Quelle</small>':''}${hints.length?`<details class="comparison-context"><summary>Hinweise</summary>${hints.map(text=>`<p>${escape(text)}</p>`).join('')}</details>`:''}</td>`;
  }).join('')}</tr>`).join('')}</tbody>`).join('')}</table></div>`;
}
function patientsView() {
  const all=Object.values(state().assessments),stats=new Map();
  for(const a of all)if(a.patientId&&matchesAssessmentType(a,filterType)){const entry=stats.get(a.patientId)??{count:0,latest:''};entry.count++;const date=selectedRevision(a)?.document.date??'';if(date>entry.latest)entry.latest=date;stats.set(a.patientId,entry);}
  const needle=patientQuery.trim().toLocaleLowerCase('de');
  const rank=p=>p.identifier===needle?0:p.identifier.startsWith(needle)?1:2;
  const list=Object.values(state().patients).filter(p=>(!needle||`${p.identifier} ${p.label}`.toLocaleLowerCase('de').includes(needle))&&(!filterType||stats.has(p.id))).sort((a,b)=>rank(a)-rank(b)||a.identifier.localeCompare(b.identifier,undefined,{numeric:true})||a.identifier.localeCompare(b.identifier));
  if(currentPatient&&!list.some(p=>p.id===currentPatient)){currentPatient='';patientResultsOpen=true;}
  const p=state().patients[currentPatient];
  const visits=p?all.filter(a=>a.patientId===p.id&&matchesAssessmentType(a,filterType)).sort((a,b)=>(selectedRevision(a)?.document.date??'9999').localeCompare(selectedRevision(b)?.document.date??'9999')):[];
  const comparisonVisits=visits.filter(a=>!isExcluded(a));
  const comparisonFields=performanceFields(comparisonVisits);if(comparisonKey&&!comparisonFields.includes(comparisonKey))comparisonKey='';
  const comparisonOptions=comparisonFields.filter(key=>key===comparisonKey||fieldLabel(key).toLocaleLowerCase('de').includes(comparisonQuery.toLocaleLowerCase('de'))),shown=list.slice(0,20);
  viewExportIds.patients=list.map(patient=>patient.id);
  return `<div class="heading"><div><h1>Patienten</h1></div>${exportButton('patients')}</div>${exportSelectionBar('patients')}<section class="card" id="patient-search-card"><div class="form-row"><label>Patient suchen<input id="patient-search" type="search" value="${escape(patientQuery)}" placeholder="iMed Patienten-ID beginnen…" autocomplete="off" aria-controls="patient-search-results" aria-describedby="patient-result-count"></label><label>Untersuchungsart<select id="patient-type-filter">${typeOptions(filterType,true)}</select></label></div>
  <div id="patient-search-results" ${patientResultsOpen?'':'hidden'}><p class="quiet patient-result-count" id="patient-result-count" role="status" aria-live="polite">${list.length?`${list.length} passende Patienten${list.length>20?' · Erste 20 Treffer; ID weiter eingrenzen.':''}`:'Keine passenden Patienten. ID oder Untersuchungsart ändern.'}</p><ul class="patient-matches" aria-label="Passende Patienten">${shown.map(patient=>{const summary=stats.get(patient.id);return `<li class="${exportSelections.patients.has(patient.id)?'export-selected':''}"><span class="patient-export-check">${exportCheckbox('patients',patient.id,'Patient '+patient.identifier)}</span><button type="button" data-select-patient="${patient.id}" data-identifier="${escape(patient.identifier)}" ${patient.id===currentPatient?'aria-current="true"':''}><span><strong>${escape(patient.identifier)}</strong>${patient.label?`<small>${escape(patient.label)}</small>`:''}</span><span class="patient-match-summary">${summary?`${summary.count} ${summary.count===1?'Untersuchung':'Untersuchungen'}${summary.latest?' · zuletzt '+fmtDate(summary.latest):''}`:'Noch keine Untersuchung'}<span aria-hidden="true"> →</span></span></button></li>`;}).join('')}</ul></div>
  <details><summary>Neuen Patienten hinzufügen</summary><form id="create-patient" class="section-spacer"><div class="form-row"><label>iMed Patienten-ID<input name="identifier" inputmode="numeric" pattern="[0-9]+" maxlength="100" required></label><button type="submit" ${!writable()?'disabled':''}>Patient speichern</button></div></form></details></section>
  ${p?`<section class="card"><div class="heading patient-history-title"><h2 id="patient-history-heading" tabindex="-1">Patient ${escape(p.identifier)}${p.label?' · '+escape(p.label):''}</h2><label class="check">${exportCheckbox('patients',p.id,'Patient '+p.identifier,'history-')}Für Export auswählen</label></div><p class="muted">${visits.length} passende Untersuchungen · ${new Set(visits.map(a=>a.stayId)).size} Aufenthalte</p>${visits.map(a=>`<div class="history-entry"><strong>${fmtDate(selectedRevision(a)?.document.date)} · Aufenthalt ${escape(a.stayId)}</strong>${isExcluded(a)?pill('Ausgeschlossen','warn'):''}<p class="assessment-type">${escape(assessmentTypeLabel(a.assessmentTypeId))}</p><small>${a.attachments.length} Berichte · ${a.revisions.length} gespeicherte Fassungen</small><div class="actions section-spacer"><button class="link" data-detail="${a.id}">Untersuchung ansehen →</button>${reportActions(a)}</div></div>`).join('')||'<p>Für diesen Patienten gibt es noch keine passenden Untersuchungen.</p>'}<div class="actions section-spacer"><button id="import-for-patient" data-import-patient="${p.id}" class="primary" ${busy||archive.snapshot.readOnly||saveFeedback?.needsCheck?'disabled':''}>＋ Neue Untersuchung für diesen Patienten importieren</button></div></section>
  <details class="card" id="patient-comparison"><summary>Messwerte vergleichen</summary><p class="quiet section-spacer">Originalwerte ohne Neuberechnung. Varianten und unvollständige Ergebnisse beachten.</p>${comparisonFields.length?`<label>Messwert suchen<input id="comparison-search" type="search" value="${escape(comparisonQuery)}" placeholder="z. B. VLMT, MoCA oder Feldname"></label><label class="section-spacer">Messwert<select id="comparison-measure">${option('','Alle Messwerte',comparisonKey)}${measurementOptions(comparisonOptions,comparisonKey)}</select></label>${patientValueKey===currentPatientValueKey()?comparisonTable(comparisonVisits,comparisonKey?[comparisonKey]:comparisonOptions):'<button id="load-patient-values" class="section-spacer">Exportierte Messwerte laden</button>'}`:'<p>Für diese Auswahl sind keine numerischen Leistungswerte vorhanden.</p>'}<p class="quiet section-spacer">Ausgeschlossene Untersuchungen werden hier ausgelassen. Fehlende Werte bleiben leer.</p></details>`:''}`;

}

function recoveryView() {
  const issues = archive?.snapshot.issues ?? [];
  const capability=(name,ok)=>`<div class="cap-row"><span>${name}</span><span>${ok?'Verfügbar':'Nicht verfügbar'}</span></div>`;
  const help=`<details class="card"><summary>Bei Problemen</summary><ul class="help-list"><li>Ordnerzugriff verweigert? Bibliothek erneut öffnen und Zugriff erlauben.</li><li>Netzlaufwerk getrennt? Verbindung wiederherstellen und Bibliothek erneut öffnen.</li><li>Dateien beschädigt? Ordner unverändert lassen und IT um Wiederherstellung in einen anderen Ordner bitten. Diese Kopie anschließend als Bibliothek öffnen.</li><li>Browserdaten gelöscht? Den bisherigen Bibliotheksordner erneut auswählen.</li><li>Nur eine Person darf die Bibliothek gleichzeitig bearbeiten.</li></ul></details>
  <details class="card"><summary>Technische Angaben</summary><div class="section-spacer">${capability('HTTPS / sicherer Kontext',c.secure)}${capability('Ordner auswählen',c.picker)}${capability('Dateien schreiben',c.streams)}${capability('Dateien prüfen',c.hashing)}${capability('Einzelzugriff im Browser',c.locks)}</div><p class="quiet section-spacer">Microsoft Edge oder Chrome verwenden. Firefox und file:// unterstützen diesen Ablauf nicht. IT-Richtlinien können den Zugriff sperren.</p>${archive?`<dl class="provenance"><dt>Version</dt><dd>${APP_VERSION}</dd><dt>Speichervorgänge</dt><dd>${archive.snapshot.records.length}</dd><dt>Archiv-ID</dt><dd class="mono">${escape(archive.snapshot.manifest.archiveId)}</dd><dt>Letzte Speicherung</dt><dd class="mono">${escape(archive.snapshot.head||'Noch keine')}</dd></dl><p class="quiet">Die Suchübersicht ist erneuerbar. „Bibliothek prüfen“ liest alle Vorgänge und Originaldateien; die Prüfung kann länger dauern.</p>`:''}</details>`;
  if(!archive)return `<div class="heading"><h1>Sicherung & Hilfe</h1></div><section class="card"><p>Öffnen Sie Ihre Bibliothek, um sie zu prüfen oder zu sichern.</p><button data-nav="storage" class="primary">Bibliothek öffnen</button></section>${help}`;
  return `<div class="heading"><h1>Sicherung & Hilfe</h1></div>
  ${issues.length?`<section class="card"><h2>Bitte prüfen</h2>${issues.map(i=>`<div class="note ${i.severity==='error'?'error':''}"><strong>${escape(i.message)}</strong><details><summary>Einzelheiten</summary><span class="mono">${escape(i.path)}</span></details></div>`).join('')}</section>`:''}
  <div class="grid2"><section class="card"><h2>Sicherheitskopie</h2><p>Wählen Sie einen anderen, leeren Ordner. Die vollständige Kopie wird nach dem Speichern geprüft.</p><button id="backup-archive" ${busy||archive.snapshot.readOnly?'disabled':''}>Sicherung erstellen</button></section>
  <section class="card"><h2>Bibliothek prüfen</h2>${pill(archive.snapshot.readOnly?'Prüfung erforderlich':archive.snapshot.verification==='full'?'Vollständig geprüft':'Bibliothek bereit',archive.snapshot.readOnly?'error':'')}<p class="section-spacer">Prüft alle gespeicherten Dateien. Bei einer unterbrochenen Speicherung wird der Speicherstand abgeglichen.</p><button id="refresh-archive" ${busy?'disabled':''}>Bibliothek prüfen</button></section></div>
  ${Object.keys(state().unlinked).length?`<details class="card"><summary>Berichte noch zuordnen (${Object.keys(state().unlinked).length})</summary>${Object.values(state().unlinked).map(a=>`<article class="import-item" data-unlinked="${a.id}">${originalCard(a)}<form data-unlinked-form="${a.id}"><label class="section-spacer">Untersuchung<select id="unlinked-target-${a.id}" data-link-target>${option('','Bitte wählen','')}${Object.values(state().assessments).map(v=>option(v.id,titleOf(v),'')).join('')}</select></label><label class="section-spacer">Zuordnung begründen<textarea id="unlinked-note-${a.id}" data-link-note maxlength="2000"></textarea></label><button type="button" data-link-attachment="${a.id}" class="section-spacer" ${!writable()?'disabled':''}>Bericht zuordnen</button></form></article>`).join('')}</details>`:''}${help}`;
}

const views = { home:homeView, changes:changesView, storage: storageView, assessments: assessmentsView, import: importView, complete:completionView, detail: detailView, patients: patientsView, recovery: recoveryView };
async function commit(operations, files = new Map(), actor = sessionActor,receipt=null) {
  if (!archive || !writer || !singleWriter || archive.snapshot.readOnly||saveFeedback?.needsCheck) fail('Schreibfreigabe fehlt. Ordner und Einzelzugriff prüfen.');
  if(!validImportActor(actor))fail('Bearbeiterkürzel erforderlich. Bearbeitungs-Modus erneut öffnen.');
  applyOperations(state(),operations); // Input errors are rejected before starting a filesystem save attempt.
  const draftKeys=[...new Set(operations.flatMap(op=>op.type==='assessment.clinical.set'?[`clinical:${op.assessmentId}`]:['patient.link','stay.update','assessment.type.set'].includes(op.type)?[`assignment:${op.assessmentId}`]:op.type==='patient.create'?['patient:create']:op.type==='revision.select'?[`revision:${op.assessmentId}`]:op.type==='attachment.link'?[`attachment:${op.attachmentId}`]:[]))];
  archive.lastAttempt=null;saving=true;
  try{
    await permission(archive.storage.handle,'readwrite',true);
    await archive.commit(operations, files, actor);
  }catch(error){
    const attempt=archive.lastAttempt;saveFeedback={draftKeys,outcome:attempt?.outcome??'not-saved',attempt,receipt,needsCheck:true,message:attempt?.recordWriteStarted?'Die Verbindung wurde während der Speicherung unterbrochen. Ob die Änderung gespeichert wurde, muss geprüft werden.':'Die Änderung wurde nicht als abgeschlossener Vorgang gespeichert. Vor einem neuen Versuch die Verbindung prüfen.',details:error.message};throw error;
  }finally{saving=false;}
  clearDrafts(draftKeys);
  saveFeedback={draftKeys,outcome:'saved',attempt:archive.lastAttempt,receipt,needsCheck:false,message:'Ihre Änderung wurde gespeichert und erneut geprüft.'};
  patientValueDocs.clear();patientValueKey='';
  if(page==='detail'&&currentId)try{detailData=await archive.assessmentDetail(currentId);}catch(error){detailError=error.message;archive.snapshot.readOnly=true;throw error;}
}
async function openDetail(id) {
  currentId=id;assessmentPdfError=null;detailData=null;detailError='';page='detail';
  await run(async()=>{try{detailData=await archive.assessmentDetail(id);}catch(error){detailError=error.message;archive.snapshot.readOnly=true;archive.snapshot.issues.push({severity:'error',path:'Quelldateien',message:error.message});throw error;}});
}
function findOriginal(id) {
  return [...Object.values(state().unlinked),...Object.values(state().assessments).flatMap(a=>[...a.revisions.map(r=>r.original),...a.attachments])].find(a=>a.id===id) || fail('Original nicht gefunden.');
}
async function readOriginal(id) {
  const a = findOriginal(id); await permission(archive.storage.handle,'read');
  const data = await archive.storage.read(objectPath(a),MAX_FILE);
  if (data.length!==a.size||await sha256(data)!==a.hash) fail('Originaldatei fehlt oder ist beschädigt. Wiederherstellung prüfen.');
  return { a, data };
}
async function downloadOriginal(id) {
  const {a,data} = await readOriginal(id);
  const url = URL.createObjectURL(new Blob([data],{type:'application/octet-stream'}));
  const link=document.createElement('a');link.href=url;link.download=a.name;link.rel='noopener';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function openReport(id) {
  const {a,data} = await readOriginal(id); if(a.kind!=='pdf')fail('Kein PDF.');
  const frame=$('#report-frame'),token=uid();clearReport();const bundle=await import('./pdf-runtime.js');pendingReport={data,token,bundle,connected:false,port:null};setReportStatus('Bericht wird lokal geladen…');frame.dataset.width='0';frame.src='./pdf-viewer.html#'+new URLSearchParams({token,origin:location.origin});armReportTimeout(pendingReport);
  const owner=Object.values(state().assessments).find(assessment=>assessment.attachments.some(file=>file.id===id));$('#report-title').textContent=owner?`Patient ${patientText(owner.patientId)} · Aufenthalt ${owner.stayId} · ${fmtDate(selectedRevision(owner)?.document.date)}`:'Originalbericht · '+a.name;
  $('#report-dialog').showModal();
}
function bind() {
  const renderStatistics=(focusId=null)=>{render();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});};
  const resetStatisticsPeriod=()=>{statisticsSettings.bucketKey='';if($('#statistics-chart-scroll'))$('#statistics-chart-scroll').scrollLeft=0;};
  if($('#statistics-preset'))$('#statistics-preset').onchange=event=>{
    const previous=statisticsRange(statisticsSettings);statisticsSettings.preset=event.target.value;
    if(statisticsSettings.preset==='custom'&&(!statisticsSettings.from||!statisticsSettings.to)){statisticsSettings.from=previous.from;statisticsSettings.to=previous.to;}
    resetStatisticsPeriod();renderStatistics('statistics-preset');
  };
  if($('#statistics-interval'))$('#statistics-interval').onchange=event=>{statisticsSettings.interval=event.target.value;resetStatisticsPeriod();renderStatistics('statistics-interval');};
  for(const key of ['from','to'])if($('#statistics-'+key))$('#statistics-'+key).onchange=event=>{statisticsSettings[key]=event.target.value;resetStatisticsPeriod();renderStatistics('statistics-'+key);};
  if($('#statistics-excluded'))$('#statistics-excluded').onchange=event=>{statisticsSettings.includeExcluded=event.target.checked;renderStatistics('statistics-excluded');};
  document.querySelectorAll('[data-stat-type]').forEach(input=>input.onchange=()=>{
    const id=input.dataset.statType;if(statisticsSettings.types===null)statisticsSettings.types=new Set(statisticsSeries(state()).map(type=>type.id));
    if(input.checked)statisticsSettings.types.add(id);else statisticsSettings.types.delete(id);renderStatistics();[...document.querySelectorAll('[data-stat-type]')].find(node=>node.dataset.statType===id)?.focus({preventScroll:true});
  });
  for(const selector of ['#statistics-all-types','#statistics-select-all'])if($(selector))$(selector).onclick=()=>{statisticsSettings.types=null;renderStatistics();};
  if($('#statistics-no-types'))$('#statistics-no-types').onclick=()=>{statisticsSettings.types=new Set();renderStatistics();};
  document.querySelectorAll('[data-stat-bucket]').forEach((bucket,index,buckets)=>{
    const select=key=>{statisticsSettings.bucketKey=key;renderStatistics();const target=[...document.querySelectorAll('[data-stat-bucket]')].find(node=>node.dataset.statBucket===key);target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',inline:'nearest'});};
    bucket.onclick=()=>select(bucket.dataset.statBucket);
    bucket.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(bucket.dataset.statBucket);}if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=buckets[index+(event.key==='ArrowLeft'?-1:1)];if(next)select(next.dataset.statBucket);}};
  });
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{if(busy)return;const target=b.dataset.nav;if(target===page){render();return;}guardAction(()=>{page=target;render();});});
  document.querySelectorAll('[data-home-view]').forEach(button=>button.onclick=()=>guardAction(()=>{
    if(busy)return;filterType='';
    if(button.dataset.homeView==='assessments'){clinicalFilters=emptyClinicalFilters();query='';fieldQuery='';measure='';filterStatus='all';listPage=0;page='assessments';}
    else{patientQuery='';currentPatient='';patientResultsOpen=true;comparisonQuery='';comparisonKey='';patientValueDocs.clear();patientValueKey='';page='patients';}
    render();
  }));
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>guardAction(()=>openDetail(b.dataset.detail)));
  document.querySelectorAll('[data-patient]').forEach(b=>b.onclick=()=>guardAction(()=>{filterType='';selectPatient(b.dataset.patient);}));
  document.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>run(()=>downloadOriginal(b.dataset.download)));
  document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>run(()=>openReport(b.dataset.report)));
  document.querySelectorAll('[data-export-id]').forEach(input=>input.onchange=()=>{const kind=input.dataset.exportKind,id=input.dataset.exportId,focus=input.id;if(input.checked)exportSelections[kind].add(id);else exportSelections[kind].delete(id);render();document.getElementById(focus)?.focus({preventScroll:true});});
  document.querySelectorAll('[data-export-all]').forEach(input=>{
    const kind=input.dataset.exportAll,ids=viewExportIds[kind],count=ids.filter(id=>exportSelections[kind].has(id)).length;input.indeterminate=count>0&&count<ids.length;
    input.onchange=()=>{for(const id of ids)if(input.checked)exportSelections[kind].add(id);else exportSelections[kind].delete(id);render();document.getElementById(input.id)?.focus({preventScroll:true});};
  });
  document.querySelectorAll('[data-export-clear]').forEach(button=>button.onclick=()=>{exportSelections[button.dataset.exportClear].clear();render();});
  document.querySelectorAll('[data-export-csv]').forEach(button=>button.onclick=()=>{const kind=button.dataset.exportCsv,ids=[...exportSelections[kind]];run(()=>downloadCsv(kind,ids));});
  if($('#mode-toggle'))$('#mode-toggle').onclick=()=>{if(writer&&singleWriter&&!archive.snapshot.readOnly&&!saveFeedback?.needsCheck)guardAction(()=>run(stopEditing));else openEditDialog();};
  if($('#refresh-view'))$('#refresh-view').onclick=()=>guardAction(()=>run(refreshView));
  if($('#recheck-connection'))$('#recheck-connection').onclick=()=>saveFeedback?.needsCheck?run(()=>checkConnection()):guardAction(()=>run(()=>checkConnection()));
  if($('#reselect-library'))$('#reselect-library').onclick=()=>run(()=>checkConnection(true));
  if($('#import-for-patient'))$('#import-for-patient').onclick=()=>{const id=$('#import-for-patient').dataset.importPatient;guardAction(()=>{if(writable())startPatientImport(id);else openEditDialog(()=>startPatientImport(id));});};
  if($('#next-patient'))$('#next-patient').onclick=()=>{resetImport();lastImportReceipt=null;saveFeedback=null;page='import';render();window.scrollTo({top:0});};
  if($('#open-folder'))$('#open-folder').onclick=()=>run(()=>openFolder(false,page==='storage'?'assessments':page));
  if($('#create-folder'))$('#create-folder').onclick=()=>run(()=>openFolder(true,page==='storage'?'assessments':page));
  if($('#activate-folder'))$('#activate-folder').onclick=()=>{const target=$('#activate-folder').dataset.activateFolder;run(()=>activateSelected(target));};
  if($('#close-library'))$('#close-library').onclick=()=>guardAction(()=>run(closeLibrary));
  if($('#probe-folder'))$('#probe-folder').onclick=()=>run(async()=>{
    lastProbe='';probeError=null;probeProgress='Ordner prüfen';
    try {if(archive||!selectedFolder)fail('Zuerst einen Ordner auswählen.');const storage=selectedFolder.storage;await permission(storage.handle,'readwrite',true);lastProbe=await probeFolder(storage,step=>{probeProgress=step;render();});await rememberFolder(storage);notice('Ausgewählter Ordner erfolgreich geprüft.');}
    catch(error){probeError={message:error.message,details:error.details};throw error;}
    finally{probeProgress='';}
  });
  if($('#refresh-archive'))$('#refresh-archive').onclick=()=>saveFeedback?.needsCheck?run(()=>checkConnection()):guardAction(()=>run(()=>checkConnection()));
  document.querySelectorAll('[data-history-filter]').forEach(input=>{
    const update=()=>{if(!input.isConnected)return;const key=input.dataset.historyFilter;if(historyFilters[key]===input.value)return;historyFilters[key]=input.value;historyPage=0;const cursor=input.selectionStart;render();const next=document.getElementById(input.id);next.focus({preventScroll:true});if(typeof cursor==='number')next.setSelectionRange(cursor,cursor);};input.oninput=update;input.onchange=update;
  });
  if($('#clear-history-filters'))$('#clear-history-filters').onclick=()=>{historyFilters=emptyHistoryFilters();historyPage=0;render();};
  if($('#history-previous'))$('#history-previous').onclick=()=>{historyPage--;render();};
  if($('#history-next'))$('#history-next').onclick=()=>{historyPage++;render();};
  if($('#backup-archive'))$('#backup-archive').onclick=()=>run(async()=>{const target=await pick();const result=await copyArchive(archive.storage,target);notice(`Sicherung geprüft: ${result.files} Dateien vollständig kopiert. Öffnen Sie den Sicherungsordner zur Wiederherstellungsprobe.`);});
  if($('#search'))$('#search').oninput=e=>{query=e.target.value;listPage=0;const pos=e.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(pos,pos);};
  if($('#archive-status-filter'))$('#archive-status-filter').onchange=e=>{filterStatus=e.target.value;listPage=0;render();};
  document.querySelectorAll('[data-clinical-filter]').forEach(input=>{
    const update=e=>{if(!e.target.isConnected)return;const key=input.dataset.clinicalFilter;if(clinicalFilters[key]===input.value)return;clinicalFilters[key]=input.value;listPage=0;const cursor=input.selectionStart;render();const next=document.querySelector(`[data-clinical-filter="${key}"]`);next.focus({preventScroll:true});if(typeof cursor==='number')next.setSelectionRange(cursor,cursor);};
    input.oninput=update;input.onchange=update;
  });
  document.querySelectorAll('[data-clear-clinical-filter]').forEach(button=>button.onclick=()=>{clinicalFilters[button.dataset.clearClinicalFilter]='';listPage=0;render();});
  if($('#measure-filter'))$('#measure-filter').onchange=e=>{measure=e.target.value;listPage=0;render();};
  if($('#field-search')){
    const update=e=>{if(!e.target.isConnected)return;fieldQuery=e.target.value;const cursor=e.target.selectionStart;render();$('#field-search').focus();$('#field-search').setSelectionRange(cursor,cursor);};$('#field-search').oninput=update;$('#field-search').onchange=update;
  }
  document.querySelectorAll('[data-clear-filter]').forEach(button=>button.onclick=()=>{const kind=button.dataset.clearFilter;if(kind==='search')query='';if(kind==='type')filterType='';if(kind==='field')measure='';if(kind==='status')filterStatus='included';listPage=0;render();});
  for(const selector of ['#assessment-type-filter','#patient-type-filter'])if($(selector))$(selector).onchange=e=>{filterType=e.target.value;listPage=0;render();};
  if($('#clear-filters'))$('#clear-filters').onclick=()=>{clinicalFilters=emptyClinicalFilters();filterType='';query='';fieldQuery='';filterStatus='included';measure='';listPage=0;render();};
  if($('#patient-search')){
    const update=e=>{if(!e.target.isConnected||patientQuery===e.target.value)return;patientQuery=e.target.value;currentPatient='';patientResultsOpen=true;const pos=e.target.selectionStart;render();$('#patient-search').focus();$('#patient-search').setSelectionRange(pos,pos);};
    $('#patient-search').oninput=update;$('#patient-search').onchange=update;
    $('#patient-search').onfocus=()=>setPatientResultsOpen(true);
    $('#patient-search').onkeydown=e=>{const buttons=[...document.querySelectorAll('[data-select-patient]')];if(e.key==='Escape'){e.preventDefault();setPatientResultsOpen(false);return;}if(['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();setPatientResultsOpen(true);const exact=buttons.find(button=>button.dataset.identifier===patientQuery);if(e.key==='Enter'&&(exact||buttons.length===1))(exact??buttons[0])?.click();else(e.key==='ArrowUp'?buttons.at(-1):buttons[0])?.focus();}};
  }
  if($('#patient-search-card'))$('#patient-search-card').onfocusout=e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))setPatientResultsOpen(false);};
  document.querySelectorAll('[data-select-patient]').forEach((button,index,buttons)=>{
    button.onclick=()=>guardAction(()=>selectPatient(button.dataset.selectPatient));
    button.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();button.click();}else if(e.key==='Escape'){e.preventDefault();$('#patient-search').focus();setPatientResultsOpen(false);}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();(buttons[index+(e.key==='ArrowDown'?1:-1)]??$('#patient-search')).focus();}};
  });
  if($('#list-previous'))$('#list-previous').onclick=()=>{listPage--;render();};
  if($('#list-next'))$('#list-next').onclick=()=>{listPage++;render();};
  if($('#comparison-measure'))$('#comparison-measure').onchange=e=>{comparisonKey=e.target.value;render();};
  if($('#comparison-search'))$('#comparison-search').oninput=e=>{if(!e.target.isConnected)return;comparisonQuery=e.target.value;const cursor=e.target.selectionStart;render();$('#comparison-search').focus();$('#comparison-search').setSelectionRange(cursor,cursor);};
  if($('#load-patient-values'))$('#load-patient-values').onclick=()=>run(async()=>{
    const docs=new Map();
    try{for(const a of Object.values(state().assessments).filter(a=>a.patientId===currentPatient&&!isExcluded(a)&&matchesAssessmentType(a,filterType))){const full=await archive.assessmentDetail(a.id);docs.set(a.id,selectedRevision(full)?.document);}}
    catch(error){archive.snapshot.readOnly=true;archive.snapshot.issues.push({severity:'error',path:'Quelldateien',message:error.message});throw error;}
    patientValueDocs=docs;patientValueKey=currentPatientValueKey();
  });
  const load=files=>run(async()=>{
    if(!writer||!singleWriter||archive.snapshot.readOnly||saveFeedback?.needsCheck)fail('Bitte zuerst bestätigen, dass Sie die Bibliothek gerade allein bearbeiten.');
    const selected=[...files],previous=rows;
    const inspected=await inspectFiles(selected,state(),columns,async(id,revisionId)=>{const full=await archive.assessmentDetail(id);return full.revisions.find(r=>r.id===revisionId).document;});
    for(const row of inspected){const old=previous.find(r=>r.hash===row.hash&&r.name===row.name);if(old&&row.status==='revision'){row.action=old.action;row.note=old.note;row.target=old.target;}}
    rows=inspected;importFiles=selected;importStage=2;
    if(!importDraft.assessmentTypeId){const csvs=rows.filter(r=>r.kind==='csv'&&!r.error&&!['duplicate','duplicate-in-batch'].includes(r.status));const types=new Set(csvs.map(r=>r.assessmentTypeId));if(csvs.length&&csvs.every(r=>r.status==='revision')&&types.size===1&&validAssessmentType(csvs[0].assessmentTypeId))importDraft.assessmentTypeId=csvs[0].assessmentTypeId;}
  });
  document.querySelectorAll('[data-import-stage]').forEach(button=>button.onclick=()=>{if(busy||button.disabled)return;importStage=Number(button.dataset.importStage);render();window.scrollTo({top:0});});
  if($('#import-files'))$('#import-files').onchange=e=>load(e.target.files);
  if($('#drop-zone')){const zone=$('#drop-zone');zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag-over');};zone.ondragleave=e=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drag-over');};zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag-over');load(e.dataTransfer.files);};}
  for(const [selector,key] of [['#import-patient-id','identifier'],['#import-stay-id','stayId']])if($(selector)){
    const update=e=>{if(importDraft[key]===e.target.value)return;importDraft[key]=e.target.value;if(key==='identifier')importDraft.confirmedPatientId='';const cursor=e.target.selectionStart;render();$(selector).focus();$(selector).setSelectionRange(cursor,cursor);};
    $(selector).oninput=update;$(selector).onchange=update;
  }
  if($('#import-assessment-type'))$('#import-assessment-type').onchange=e=>{importDraft.assessmentTypeId=e.target.value;render();};
  if($('#confirm-import-patient'))$('#confirm-import-patient').onclick=()=>{const patient=planPatientImport(rows,state(),importDraft).patient;if(patient)importDraft.confirmedPatientId=patient.id;render();};
  if($('#patient-import-form'))$('#patient-import-form').onsubmit=e=>{e.preventDefault();if(!planPatientImport(rows,state(),importDraft).ready)return;importStage=3;render();window.scrollTo({top:0});};
  document.querySelectorAll('[data-diagnosis-status]').forEach(input=>input.onchange=()=>{
    const form=input.closest('form');if(input.checked)form.querySelectorAll('[data-diagnosis-status]').forEach(other=>{if(other!==input)other.checked=false;});
    if(form.id==='clinical-import-form')importDraft.clinical.diagnosisStatus=form.querySelector('[data-diagnosis-status]:checked')?.dataset.diagnosisStatus??null;
  });
  document.querySelectorAll('#clinical-import-form [data-clinical-field]').forEach(input=>{
    const update=()=>{importDraft.clinical[input.dataset.clinicalField]=input.value;};input.oninput=update;input.onchange=update;
  });
  if($('#clinical-import-form'))$('#clinical-import-form').onsubmit=e=>{e.preventDefault();if(!writable()||!planPatientImport(rows,state(),importDraft).ready)return;try{importDraft.clinical=readClinicalForm(e.target,importDraft.clinical);}catch(error){notice(error.message,true);return;}importStage=4;render();window.scrollTo({top:0});};
  if($('#clinical-edit-form'))$('#clinical-edit-form').onsubmit=e=>{
    e.preventDefault();if(!writable())return;let clinical;try{clinical=readClinicalForm(e.target,clinicalOf(state().assessments[currentId]));}catch(error){notice(error.message,true);return;}
    run(async()=>{await commit([{type:'assessment.clinical.set',assessmentId:currentId,clinical}]);notice('Klinische Angaben gespeichert.');});
  };
  document.querySelectorAll('[data-remove-import-file]').forEach(button=>button.onclick=()=>load(importFiles.filter((_,index)=>index!==rows.findIndex(r=>r.id===button.dataset.removeImportFile))));
  document.querySelectorAll('[data-replace-pdf]').forEach(input=>input.onchange=e=>{const replacement=e.target.files[0];if(replacement)load(importFiles.map((file,index)=>index===rows.findIndex(r=>r.id===input.dataset.replacePdf)?replacement:file));});
  document.querySelectorAll('[data-add-csv]').forEach(input=>input.onchange=e=>{if(e.target.files.length)load([...importFiles,...e.target.files]);});
  document.querySelectorAll('[data-revision-field]').forEach(input=>input.onchange=()=>{
    const row=rows.find(r=>r.id===input.closest('[data-row]').dataset.row),field=input.dataset.revisionField;row[field]=input.value;
    if(field==='target'&&state().assessments[row.target]){run(async()=>{const full=await archive.assessmentDetail(row.target);row.comparisonDocument=selectedRevision(full)?.document;row.changes=row.comparisonDocument?changedFields(row.comparisonDocument,row.document):[];});return;}
    render();
  });
  if($('#create-patient'))$('#create-patient').onsubmit=e=>{
    e.preventDefault();const data=new FormData(e.target);const patient={id:uid(),identifier:String(data.get('identifier')),label:''};
    run(async()=>{await commit([{type:'patient.create',patient}]);currentPatient=patient.id;filterType='';patientQuery=patient.identifier;patientResultsOpen=false;notice('Patient gespeichert.');});
  };
  if($('#commit-import'))$('#commit-import').onclick=()=>run(async()=>{
    const built=buildPatientImport(rows,state(),{...importDraft,actor:sessionActor});
    const receipt=importReceipt(built,planPatientImport(rows,state(),importDraft),importDraft);await commit(built.operations,built.files,built.actor,receipt);lastImportReceipt=receipt;resetImport();clinicalFilters=emptyClinicalFilters();query='';filterType='';filterStatus='included';listPage=0;page='complete';window.scrollTo({top:0});
  });
  if($('#toggle-exclusion'))$('#toggle-exclusion').onclick=()=>run(async()=>{const excluded=!isExcluded(state().assessments[currentId]);await commit([{type:'assessment.exclusion.set',assessmentId:currentId,excluded}]);notice(excluded?'Datensatz ausgeschlossen. Originaldateien bleiben erhalten.':'Datensatz wieder eingeschlossen.');});
  if($('#reassign-patient')){const input=$('#reassign-patient');input.oninput=updateAssignmentSuggestions;input.onchange=updateAssignmentSuggestions;updateAssignmentSuggestions();}
  if($('#assignment-form'))$('#assignment-form').onsubmit=e=>{
    e.preventDefault();if(!writable())return;
    const draft={identifier:$('#reassign-patient').value,stayId:$('#reassign-stay').value,reason:$('#reassign-reason').value,assessmentTypeId:$('#reassign-type').value};
    let operations;try{operations=buildAssignment(state(),currentId,draft);}catch(error){notice(error.message,true);return;}
    run(async()=>{await commit(operations);notice('Zuordnung und Untersuchungsart mit Historie gespeichert.');});
  };
  if($('#assessment-pdf'))$('#assessment-pdf').onchange=e=>{
    const file=e.target.files[0];if(!file||!writable())return;const id=currentId;assessmentPdfError=null;
    run(async()=>{let built;try{built=await buildAssessmentPdf(file,state().assessments[id]);}catch(error){assessmentPdfError={id,message:error.message};notice(error.message,true);return;}
      if(built.duplicate){notice('Dieser PDF-Bericht ist bereits vorhanden.');return;}
      await commit(built.operations,built.files);notice('PDF-Bericht hinzugefügt.');
    });
  };
  if($('#revision-form'))$('#revision-form').onsubmit=event=>event.preventDefault();
  document.querySelectorAll('[data-unlinked-form]').forEach(form=>{form.onsubmit=event=>event.preventDefault();});
  if($('#select-revision'))$('#select-revision').onclick=()=>{const revisionId=$('#selected-revision').value;run(async()=>{await commit([{type:'revision.select',assessmentId:currentId,revisionId}]);notice('Revisionsauswahl dauerhaft gespeichert.');});};
  document.querySelectorAll('[data-link-attachment]').forEach(b=>b.onclick=()=>{const parent=b.closest('[data-unlinked]');const assessmentId=parent.querySelector('[data-link-target]').value;const note=parent.querySelector('[data-link-note]').value;run(async()=>{await commit([{type:'attachment.link',attachmentId:b.dataset.linkAttachment,assessmentId,note}]);notice('Anhang mit Zuordnungshistorie gespeichert.');});});
}
const editDialog=$('#edit-mode-dialog');
$('#session-actor').oninput=()=>setEditDialogBusy(editDialogBusy);
$('#session-actor').onchange=()=>setEditDialogBusy(editDialogBusy);
function setEditDialogBusy(value){editDialogBusy=value;$('#session-actor').disabled=value;$('#single-writer').disabled=value;$('#cancel-editing').disabled=value;$('#confirm-editing').disabled=value||!$('#single-writer').checked||!validImportActor($('#session-actor').value);}
$('#single-writer').onchange=()=>{$('#confirm-editing').disabled=editDialogBusy||!$('#single-writer').checked||!validImportActor($('#session-actor').value);};
$('#cancel-editing').onclick=()=>editDialog.close();
editDialog.oncancel=event=>{if(editDialogBusy)event.preventDefault();};
editDialog.onclose=()=>{if(!editDialog.open&&!editDialogBusy){pendingEditAction=null;$('#single-writer').checked=false;$('#confirm-editing').disabled=true;$('#mode-toggle')?.focus({preventScroll:true});}};
$('#confirm-editing').onclick=async()=>{
  if(busy||editDialogBusy||!editDialog.open||!$('#single-writer').checked||!validImportActor($('#session-actor').value))return;
  setEditDialogBusy(true);$('#edit-mode-error').hidden=true;
  await run(async()=>{
    try{const enabled=await enableEditing();if(enabled){const action=pendingEditAction;pendingEditAction=null;editDialog.close();action?.();}else{const error=$('#edit-mode-error');error.textContent=lockError;error.hidden=false;}}
    catch(cause){const error=$('#edit-mode-error');error.textContent=cause.message||'Bearbeitungs-Modus konnte nicht aktiviert werden.';error.hidden=false;}
    finally{setEditDialogBusy(false);}
  });
  if(!editDialog.open){$('#single-writer').checked=false;$('#confirm-editing').disabled=true;$('#mode-toggle')?.focus({preventScroll:true});}
};

const draftDialog=$('#draft-dialog');
function setGuardBusy(value){guardBusy=value;for(const id of ['draft-save','draft-discard','draft-cancel'])document.getElementById(id).disabled=value;}
$('#draft-cancel').onclick=()=>draftDialog.close();
draftDialog.oncancel=event=>{if(guardBusy)event.preventDefault();};
draftDialog.onclose=()=>{if(!guardBusy&&!draftDialog.open)pendingAction=null;};
$('#draft-discard').onclick=()=>{const action=pendingAction;pendingAction=null;clearDrafts([...drafts.entries.keys()]);resetImport();draftDialog.close();action?.();};
$('#draft-save').onclick=async()=>{
  if(guardBusy)return;setGuardBusy(true);$('#draft-error').hidden=true;
  try{const saved=await savePendingEdits();if(saved){const action=pendingAction;pendingAction=null;draftDialog.close();action?.();}else{const error=$('#draft-error');error.textContent='Die Änderungen konnten nicht bestätigt werden. Bitte den Speicherstand prüfen.';error.hidden=false;}}
  catch(cause){const error=$('#draft-error');error.textContent=cause.message;error.hidden=false;}
  finally{setGuardBusy(false);}
};
document.addEventListener('input',captureFormDrafts);
document.addEventListener('change',captureFormDrafts);
window.addEventListener('beforeunload',event=>{if(saving||hasUnsaved()){event.preventDefault();event.returnValue='';}});

function setReportStatus(text){$('#report-frame').dataset.status=text;$('#report-status').textContent=text;}
function armReportTimeout(report){clearTimeout(report.timer);report.timer=setTimeout(()=>{if(pendingReport!==report)return;report.worker?.terminate();report.port?.close();report.data=null;const frame=$('#report-frame');frame.src='about:blank';setReportStatus('Die PDF-Ansicht hat zu lange gedauert. Original bleibt erhalten.');},30000);}
function clearReport(){pendingReport?.port?.close();pendingReport?.worker?.terminate();clearTimeout(pendingReport?.timer);pendingReport=null;const frame=$('#report-frame');frame.src='about:blank';setReportStatus('');frame.dataset.width='0';}
$('#close-report').onclick=()=>{clearReport();$('#report-dialog').close();};
$('#report-dialog').onclose=()=>{if(!$('#report-dialog').open)clearReport();};
window.addEventListener('message',event=>{
  const frame=$('#report-frame');
  if(!validPdfReady(event,frame.contentWindow,pendingReport))return;
  const report=pendingReport,port=event.ports[0];report.connected=true;report.port=port;const worker=new Worker('./pdf-worker.mjs',{type:'module'}),channel=new MessageChannel();report.worker=worker;worker.postMessage({type:'npt-port'},[channel.port1]);worker.onerror=()=>{if(pendingReport===report){setReportStatus('PDF-Ansicht nicht verfügbar. Original bleibt erhalten.');clearTimeout(report.timer);}};
  port.onmessage=({data})=>{
    if(pendingReport!==report)return;
    if(data?.type==='renderer-ready'&&report.data){const bytes=report.data;report.data=null;port.postMessage({type:'document',data:bytes.buffer},[bytes.buffer]);}
    else if(validPdfStatus(data)){setReportStatus(data.text);frame.dataset.width=String(data.width);if(/^Seite [0-9]+ \/ [0-9]+$/.test(data.text))clearTimeout(report.timer);else if(data.text.includes('…'))armReportTimeout(report);else clearTimeout(report.timer);}
  };
  port.postMessage({type:'init',renderer:report.bundle.renderer,runtime:report.bundle.runtime},[channel.port2]);
});

render();
