import { APP_VERSION, uid, fail, sha256, MAX_FILE } from './shared.js';
import { capabilities, canOpen, permission, FolderStorage, createArchive, readManifest, probeFolder, inspectFolder } from './storage.js';
import { Archive, copyArchive } from './archive.js';
import { inspectFiles, buildImport } from './import.js';
import { objectPath, selectedRevision } from './model.js';
import { sourceValue, changedFields } from './csv.js';
import { columns } from './catalogue.js';
import { ASSESSMENT_TYPES, assessmentTypeLabel, validAssessmentType, matchesAssessmentType } from './assessment-types.js';
import { SUMMARY_MEASURES, measureContext } from './summary.js';

const $ = s => document.querySelector(s);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = d => d ? d.split('-').reverse().join('.') : 'Datum unbekannt';
const pill = (s, kind = '') => `<span class="pill ${kind}">${escape(s)}</span>`;
const option = (value, label, selected) => `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`;
const c = capabilities();
let archive = null, page = 'storage', rows = [], pendingPatients = [], currentId = '', currentPatient = '', query = '', measure = '', filterPatient = '', listPage = 0, busy = false;
let writer = false, releaseLock = null, lockCompletion = null, singleWriter = false, noticeTimer, sourceFolderName = '', lastProbe = '', pendingReport = null;
let probeError = null, probeProgress = '', selectedFolder = null;
let filterType='',patientQuery='',detailData=null,importStage=1;
let detailError='';
let patientValueDocs=new Map(),patientValueKey='';
const currentPatientValueKey=()=>`${currentPatient}|${filterType}|${archive?.snapshot.head}`;
const typeOptions=(selected='',filter=false)=>option('',filter?'Alle Untersuchungsarten':'Bitte Untersuchungsart auswählen',selected)+(filter?option('unassigned','Noch nicht zugeordnet',selected):'')+ASSESSMENT_TYPES.map(t=>option(t.id,t.label,selected)).join('');
const state = () => archive?.snapshot.state;
const writable = () => archive && writer && singleWriter && !archive.snapshot.readOnly && !busy;
const patients = () => [...Object.values(state()?.patients ?? {}), ...pendingPatients];
const patientText = id => { const p = state()?.patients[id]; return p ? `${p.identifier}${p.label ? ' · ' + p.label : ''}` : 'Nicht zugeordnet'; };
const titleOf = a => `${patientText(a.patientId)} · ${fmtDate(selectedRevision(a)?.document.date)}`;
function notice(message, error = false) {
  const node = $('#notice'); node.textContent = message; node.className = `visible${error ? ' error' : ''}`;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { node.className = ''; }, error ? 16000 : 7500);
}
async function run(task) {
  if (busy) return;
  busy = true; render();
  try { await task(); } catch (e) { notice(e.message || 'Vorgang fehlgeschlagen. Ordner erneut auswählen.', true); }
  finally { busy = false; render(); }
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
  const manifest = create ? await createArchive(storage) : await readManifest(storage);
  const opened = await Archive.open(storage,{compact:true});
  await lockFor(manifest.archiveId);
  archive = opened; sourceFolderName = storage.handle.name; singleWriter = false;
  rows = []; pendingPatients = []; selectedFolder = null; detailData=null;detailError='';patientValueDocs.clear();patientValueKey='';importStage=1;query='';filterType='';filterPatient='';patientQuery='';currentPatient='';measure='';listPage=0;page = target;
}
async function openFolder(create = false, target = 'assessments') {
  // Picker executes while this handler still has user activation.
  const storage = await pick(create ? 'readwrite' : 'read');
  const choice = await rememberFolder(storage);
  if ((!create && choice.kind === 'archive') || (create && choice.kind === 'empty')) await activateFolder(storage, create, target);
  else { page = target; notice(choice.kind === 'empty' ? 'Ordner ausgewählt. Archiv einmalig anlegen; eine weitere Ordnerauswahl ist nicht nötig.' : 'Ordner ausgewählt. Den nächsten Schritt in der Ordnerkarte wählen.'); }
}
async function activateSelected(target) {
  const choice = selectedFolder;
  if (!choice || !['empty', 'archive'].includes(choice.kind)) fail('Einen leeren Ordner oder ein lesbares Archiv auswählen.');
  try { await activateFolder(choice.storage, choice.kind === 'empty', target); }
  catch (error) { await rememberFolder(choice.storage); throw error; }
  notice(choice.kind === 'empty' ? 'Archiv angelegt und geöffnet. Ordner bleibt beim Menüwechsel aktiv.' : 'Archiv geöffnet. Ordner bleibt beim Menüwechsel aktiv.');
}
function selectedFolderCard(target = 'import') {
  const choice = selectedFolder;
  if (!choice) return '';
  const usable = ['empty', 'archive'].includes(choice.kind);
  return `<section class="card" id="selected-folder"><div class="eyebrow">Ausgewählter Ordner</div><h2>${escape(choice.name)}</h2><p class="muted">${choice.kind === 'empty' ? 'Der Ordner ist leer. Ein Archiv muss hier einmalig angelegt werden. Die Ordnerauswahl bleibt für diesen Schritt erhalten.' : choice.kind === 'archive' ? 'Ein bestehendes Archiv wurde erkannt. Es kann aus diesem Ordner geöffnet werden.' : choice.kind === 'blocked' ? escape(choice.message) : 'Dieser Ordner enthält Dateien, aber kein lesbares Archiv. Für ein neues Archiv einen leeren Ordner wählen. Vorhandene Dateien werden nicht verändert.'}</p>${usable ? `<button class="primary" id="activate-folder" data-activate-folder="${target}" ${busy ? 'disabled' : ''}>${choice.kind === 'empty' ? 'Archiv hier anlegen & fortfahren' : 'Ausgewähltes Archiv öffnen'}</button>` : ''}<p class="quiet section-spacer">${choice.kind === 'empty' ? 'Erst dieser Schritt legt die Archivdatei im ausgewählten Ordner an.' : 'Patientenverknüpfungen, Revisionen und Originale werden aus dem Ordner gelesen.'}</p></section>`;
}
function archiveSetupView() {
  if (selectedFolder) return selectedFolderCard(page);
  return `<section class="card empty"><h1>Archiv für diesen Bereich öffnen</h1><p class="muted">Einen vorhandenen Archivordner auswählen oder ein neues Archiv in einem leeren Ordner anlegen. Der Ordner bleibt danach für alle Menüpunkte aktiv.</p><div class="actions"><button id="open-folder" class="primary" ${!canOpen(c)||busy?'disabled':''}>Archivordner auswählen</button><button id="create-folder" ${!canOpen(c)||busy?'disabled':''}>Neues Archiv anlegen</button></div></section>`;
}
function patientOptions(selected = 'unresolved') {
  return option('unresolved', 'Bewusst nicht zugeordnet', selected) + patients().map(p => option(p.id, `${p.identifier}${p.label ? ' · ' + p.label : ''}`, selected)).join('');
}
function nav() {
  return [['assessments','▤','Untersuchungen'],['patients','♧','Patienten'],['import','↓','Importieren'],['recovery','↺','Sicherung & Hilfe'],['storage','▱','Bibliothek öffnen']].map(([id,icon,label]) => `<button data-nav="${id}" class="${page === id || (id === 'assessments' && page === 'detail') ? 'active' : ''}"><span aria-hidden="true">${icon}</span>${label}</button>`).join('');
}
function render() {
  const names = { storage: 'Archivordner', assessments: 'Testungen', patients: 'Patientenverlauf', import: 'Import', detail: 'Testungsdetails', recovery: 'Sicherung & Prüfung' };
  const lockNotice = archive ? `<div class="read-only">${!writer ? '<div class="note error">Schreibschutz: Ein anderer Tab verwendet diese Bibliothek bereits, oder der Browser kann den Einzelzugriff nicht absichern. Sie können die Einträge lesen. Zum Bearbeiten andere Archiv-Tabs schließen und die Bibliothek erneut öffnen.</div>' : ''}
    ${archive.snapshot.readOnly ? '<div class="note error">Wiederherstellungsprüfung erforderlich. Angezeigt wird der letzte vollständig lesbare Stand. Schreiben ist gesperrt. Unter „Sicherung & Prüfung“ neu einlesen.</div>' : ''}
    ${writer && !archive.snapshot.readOnly ? `<label class="check inline-check"><input id="single-writer" type="checkbox" ${singleWriter ? 'checked' : ''}>Ich bearbeite diese Bibliothek gerade allein. Auch an anderen PCs arbeitet niemand gleichzeitig daran.</label>` : ''}</div>` : '';
  $('#app').innerHTML = `<div class="shell"><aside><div class="brand"><span class="brandmark" aria-hidden="true">n</span>Digitale NPT</div><div class="brand-sub">Assessment-Archiv</div><nav aria-label="Hauptnavigation">${nav()}</nav><div class="aside-bottom"><strong><span class="local-dot"></span>Patienteninhalte bleiben lokal</strong>Im freigegebenen Archivordner.<br>App ${APP_VERSION} · Synthetische Pilotphase</div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">Digitale Neuropsychologie &nbsp; / &nbsp; <b>${names[page]}</b></div>${archive ? pill(sourceFolderName, archive.snapshot.readOnly ? 'warn' : '') : selectedFolder ? pill(selectedFolder.name+' · noch nicht geöffnet','warn') : pill('Kein Archiv geöffnet','warn')}</header>${busy ? '<div class="busybar" role="status">Ihre Bibliothek wird vorbereitet. Bitte dieses Fenster geöffnet lassen…</div>' : ''}<main>${archive?.snapshot.manifest.syntheticOnly?'<div class="note good">Übungsbibliothek · Alle Patienten und Untersuchungen sind erfunden.</div>':''}${lockNotice}${(!archive && page !== 'storage') ? archiveSetupView() : views[page]() }<p class="footer-note">Digitale NPT Archiv · Pilot ${APP_VERSION} · Originalwerte ohne Neuberechnung · Freigabe am Krankenhaus-PC steht aus</p></main></div></div>`;
  bind();
  if(busy)document.querySelectorAll('#app button,#app input,#app select,#app textarea').forEach(control=>{control.disabled=true;});
}
function storageView() {
  const capability=(name,ok)=>`<div class="cap-row"><span>${name}</span><span>${ok?'Verfügbar':'Nicht verfügbar'}</span></div>`;
  return `<div class="heading"><div><div class="eyebrow">Willkommen im NPT Archiv</div><h1>Ihre Untersuchungen an einem Ort</h1><p class="muted">Exporte übernehmen, Patienten zuordnen und frühere Untersuchungen wiederfinden.</p></div></div>
  <section class="card hero"><div><h2>Mit Ihrer Bibliothek beginnen</h2><p>Ihre Dateien bleiben in dem Ordner, den Sie auswählen. Öffnen Sie eine vorhandene Bibliothek oder legen Sie beim ersten Start eine neue in einem leeren Ordner an.</p><div class="actions"><button id="open-folder" class="primary" ${!canOpen(c)||busy?'disabled':''}>Meine Bibliothek öffnen</button><button id="create-folder" ${!canOpen(c)||busy?'disabled':''}>Neue Bibliothek anlegen</button></div><p class="quiet section-spacer">Nach dem Öffnen bleibt die Bibliothek für alle Menüpunkte aktiv.</p></div><ol class="welcome-steps"><li><b>Ordner auswählen</b><span>Hier bleiben Dateien und Zuordnungen gespeichert.</span></li><li><b>Untersuchungen übernehmen</b><span>Patient, Aufenthalt und Untersuchungsart prüfen.</span></li><li><b>Wiederfinden</b><span>Nach Patienten, Datum und Untersuchungsart suchen.</span></li></ol></section>
  ${selectedFolderCard('import')}
  ${archive?`<section class="card"><h2>Sie arbeiten mit „${escape(sourceFolderName)}“</h2><p class="muted">${Object.keys(state().assessments).length} Untersuchungen · ${Object.keys(state().patients).length} Patienten</p><div class="actions"><button data-nav="assessments">Untersuchungen ansehen</button><button data-nav="import" class="primary">Neue Dateien übernehmen</button></div></section>`:''}
  <section class="card"><h2>Vor dem ersten Import: Ordner kurz ausprobieren</h2><p class="muted">Die Prüfung schreibt eine kleine erfundene Textdatei, öffnet sie erneut und entfernt sie anschließend. Ihre Untersuchungen werden dabei nicht verändert.</p><button id="probe-folder" ${!canOpen(c)||busy?'disabled':''}>Schreib- und Leseprüfung starten</button>${busy&&probeProgress?`<p role="status" class="quiet section-spacer">${escape(probeProgress)}…</p>`:''}${lastProbe?`<div class="note good">${escape(lastProbe)} Nutzen Sie jetzt die Karte „Ausgewählter Ordner“, um fortzufahren.</div>`:''}${probeError?`<div class="note error" role="alert"><strong>${escape(probeError.message)}</strong><details><summary>Technische Einzelheiten</summary><pre>${escape(probeError.details||'')}</pre></details></div>`:''}</section>
  <details class="card" ${!canOpen(c)?'open':''}><summary>Hilfe bei Browser oder Ordnerzugriff</summary><p class="section-spacer">Verwenden Sie Microsoft Edge oder Chrome. Wählen Sie einen lokal verfügbaren Ordner. Für die spätere Nutzung im Krankenhaus wird der dort freigegebene Browser und Archivordner geprüft.</p>${capability('Sicherer Browserzugriff',c.secure)}${capability('Ordner auswählen',c.picker)}${capability('Dateien schreiben',c.streams)}${capability('Dateien auf Unversehrtheit prüfen',c.hashing)}${capability('Einzelzugriff im Browser',c.locks)}<p class="quiet section-spacer">Firefox und das direkte Öffnen über file:// unterstützen diesen Ablauf nicht. Bei verweigerter Berechtigung den Ordner erneut auswählen. Die Bereitstellung für das Krankenhaus wird später mit IT abgestimmt.</p></details>`;
}
function assessmentsView() {
  const all=Object.values(state().assessments);
  const list=all.filter(a=>{
    const d=selectedRevision(a)?.document;
    const hay=[patientText(a.patientId),a.stayId,a.sessionId,assessmentTypeLabel(a.assessmentTypeId),d?.date,d?.dateText,sourceValue(d,'demographics_examiner_initials'),JSON.stringify(d?.normalized)].join(' ').toLocaleLowerCase('de');
    return (!query||hay.includes(query.toLocaleLowerCase('de')))&&matchesAssessmentType(a,filterType)&&(!filterPatient||a.patientId===filterPatient||(filterPatient==='unresolved'&&a.patientId===null))&&(!measure||(d?.normalized[measure]!=null&&d?.normalized[measure]!==''));
  }).sort((a,b)=>(selectedRevision(b)?.document.date??'').localeCompare(selectedRevision(a)?.document.date??'')||a.id.localeCompare(b.id));
  const totalPages=Math.max(1,Math.ceil(list.length/50));listPage=Math.min(listPage,totalPages-1);const visible=list.slice(listPage*50,(listPage+1)*50);
  return `<div class="heading"><div><div class="eyebrow">Ihre Bibliothek</div><h1>Untersuchungen</h1><p class="muted">Finden Sie frühere Untersuchungen und die zugehörigen Berichte.</p></div><button class="primary" data-nav="import" ${!writable()?'disabled':''}>＋ Neue Dateien übernehmen</button></div>
  <div class="grid3"><div class="card metric"><span>Untersuchungen</span><b>${all.length}</b></div><div class="card metric"><span>Patienten</span><b>${Object.keys(state().patients).length}</b></div><div class="card metric"><span>Zuordnung noch offen</span><b>${all.filter(a=>!a.patientId).length+Object.keys(state().unlinked).length}</b></div></div>
  <div class="toolbar"><label>Suchen<input id="search" type="search" value="${escape(query)}" placeholder="Patienten-ID, Aufenthalt, Datum oder Untersucher…"></label><label>Untersuchungsart<select id="assessment-type-filter">${typeOptions(filterType,true)}</select></label><label>Patient<select id="patient-filter">${option('','Alle Patienten',filterPatient)}${patientOptions(filterPatient)}</select></label></div>
  <details class="extra-filter"><summary>Nach einem exportierten Messwert filtern</summary><label class="section-spacer">Messwert vorhanden<select id="measure-filter">${option('','Alle Untersuchungen',measure)}${SUMMARY_MEASURES.map(([key,label,unit])=>option(key,`${label} · ${unit}`,measure)).join('')}</select></label></details>
  <p class="result-count section-spacer">${list.length} von ${all.length} Untersuchungen · Neueste zuerst, unbekannte Daten am Ende</p>${list.length?`<div class="table-wrap"><table><thead><tr><th>Patient / Aufenthalt</th><th>Untersuchung</th><th>Untersuchungsart</th><th>Berichte</th><th></th></tr></thead><tbody>${visible.map(a=>{const d=selectedRevision(a)?.document;return `<tr><td><strong>${escape(patientText(a.patientId))}</strong><small>Aufenthalt ${escape(a.stayId)}</small></td><td><strong>${fmtDate(d?.date)}</strong><small>${escape(d?.timeText||'Uhrzeit nicht angegeben')} · ${escape(sourceValue(d,'demographics_examiner_initials')||'Untersucher nicht angegeben')}</small>${a.revisions.length>1?pill(`${a.revisions.length} Fassungen`,'warn'):''}</td><td class="assessment-type">${escape(assessmentTypeLabel(a.assessmentTypeId))}</td><td>${a.attachments.filter(f=>f.kind==='pdf').length} PDF<small>${a.attachments.length?'Originalberichte erhalten':'Bericht kann später ergänzt werden'}</small></td><td><button class="link" data-detail="${a.id}">Ansehen →</button></td></tr>`;}).join('')}</tbody></table></div>${totalPages>1?`<div class="actions section-spacer"><button id="list-previous" ${listPage===0?'disabled':''}>← Zurück</button><span>Seite ${listPage+1} / ${totalPages}</span><button id="list-next" ${listPage===totalPages-1?'disabled':''}>Weiter →</button></div>`:''}`:`<section class="card empty"><div class="empty-icon">▤</div><h2>${all.length?'Keine passenden Untersuchungen':'Beginnen Sie mit Ihren ersten Exportdateien'}</h2><p class="muted">${all.length?'Passen Sie Suche oder Filter an.':'CSV und PDF auswählen, zuordnen und gemeinsam speichern.'}</p>${!all.length?'<button data-nav="import" class="primary">Dateien übernehmen</button>':'<button id="clear-filters">Filter zurücksetzen</button>'}</section>`}`;
}
function rowProblems(row) {
  if(!row.included||row.error||['duplicate','duplicate-in-batch'].includes(row.status))return [];
  const problems=[];
  if(row.kind==='csv'){
    if(!/^[0-9]{1,100}$/.test(row.stayId))problems.push('Aufenthalts-ID eingeben');
    if(!validAssessmentType(row.assessmentTypeId))problems.push('Untersuchungsart auswählen');
    if(!row.action)problems.push('Umgang mit der Datei auswählen');
    if(row.status==='revision'&&!row.note.trim())problems.push('Grund für die neue Fassung angeben');
  }else{
    if(!row.target)problems.push('Bericht zuordnen oder bewusst offen lassen');
    if(row.target&&row.target!=='unlinked'&&!row.note.trim())problems.push('Zuordnung kurz begründen');
    if(row.target.startsWith('batch:')&&!rows.some(r=>'batch:'+r.id===row.target&&r.included))problems.push('Die zugehörige Untersuchung wurde abgewählt');
  }
  if(!row.confirmed)problems.push('Angaben als geprüft bestätigen');
  return problems;
}

function importView() {
  const active=rows.filter(r=>r.included&&!r.error&&!['duplicate','duplicate-in-batch'].includes(r.status));
  const pending=active.filter(r=>rowProblems(r).length);
  const status={new:'Neue Untersuchung',revision:'Geänderte Datei',duplicate:'Bereits in der Bibliothek','duplicate-in-batch':'Doppelt ausgewählt',attachment:'Bericht zuordnen'};
  return `<div class="heading"><div><div class="eyebrow">Neue Exporte übernehmen</div><h1>In drei Schritten zur Bibliothek</h1><p class="muted">Die Originaldateien bleiben erhalten. Sie entscheiden, zu welchem Patienten, Aufenthalt und welcher Untersuchungsart sie gehören.</p></div></div>
  <ol class="import-steps" aria-label="Importschritte"><li class="${importStage===1?'current':''}"><button data-import-stage="1"><b>1</b> Dateien auswählen</button></li><li class="${importStage===2?'current':''}"><button data-import-stage="2" ${!rows.length?'disabled':''}><b>2</b> Zuordnen & prüfen</button></li><li class="${importStage===3?'current':''}"><button data-import-stage="3" ${!rows.length?'disabled':''}><b>3</b> Gemeinsam speichern</button></li></ol>
  ${importStage===1?`<section class="card"><h2>1 · Welche Dateien möchten Sie übernehmen?</h2><p class="muted">Wählen Sie die vom iPad übertragenen CSV-Dateien und die zugehörigen PDF-Berichte. Mehrere Untersuchungen können zusammen übernommen werden.</p><div id="drop-zone" class="file-picker"><strong>Dateien hier ablegen</strong><p class="quiet">Oder über die Dateiauswahl auswählen.</p><label>CSV und PDF auswählen<input id="import-files" type="file" accept=".csv,.pdf" multiple ${!writable()?'disabled':''}></label></div><details><summary>Welche Dateien sind möglich?</summary><p class="quiet section-spacer">CSV und PDF · bis 100 Dateien / 128 MiB insgesamt, 32 MiB pro Datei, CSV bis 8 MiB. Vollständige iPad-Backups werden in dieser Version noch nicht importiert. Die vorhandenen Dateien der Bibliothek bleiben erhalten.</p></details>${rows.length?'<button class="primary section-spacer" data-import-stage="2">Mit der vorhandenen Auswahl fortfahren →</button>':''}</section>`:''}
  ${importStage===2?`<section class="card"><h2>2 · Wem gehören die Untersuchungen?</h2><p class="muted">Wählen Sie bei jeder Untersuchung die individuelle Patienten-ID, den Aufenthalt und die Untersuchungsart. Initialen allein reichen zur sicheren Zuordnung nicht aus.</p><details ${!patients().length?'open':''}><summary>Eine neue Patienten-ID hinzufügen</summary><form id="add-patient" class="section-spacer"><div class="form-row"><label>Numerische Patienten-ID<input name="identifier" inputmode="numeric" pattern="[0-9]+" maxlength="100" required placeholder="z. B. 00012345"></label><label>Lokales Kürzel (optional)<input name="label" maxlength="200" placeholder="Freigegebenes Anzeigekürzel"></label><button type="submit" ${!writable()?'disabled':''}>Für diese Auswahl hinzufügen</button></div></form><p class="quiet section-spacer">Neue Patienten werden zusammen mit dem Import gespeichert.</p></details>${pendingPatients.length?`<p class="quiet section-spacer">Für diesen Import hinzugefügt: ${pendingPatients.map(p=>escape(p.identifier)).join(', ')}</p>`:''}
  ${active.filter(r=>r.kind==='csv'&&r.status==='new').length>1?`<details class="section-spacer"><summary>Mehrere neue Untersuchungen gemeinsam zuordnen</summary><p class="quiet section-spacer">Nur verwenden, wenn die ausgewählten neuen Untersuchungen tatsächlich zusammengehören. Geänderte Fassungen werden einzeln geprüft. Die Bestätigung je Datei bleibt erforderlich.</p><div class="form-row"><label>Patient<select id="bulk-patient">${option('','Nicht ändern','')}${patientOptions('')}</select></label><label>Aufenthalts-ID<input id="bulk-stay" inputmode="numeric" maxlength="100" placeholder="Leer = nicht ändern"></label><label>Untersuchungsart<select id="bulk-type">${option('','Nicht ändern','')}${ASSESSMENT_TYPES.map(t=>option(t.id,t.label,'')).join('')}</select></label></div><button id="apply-bulk" class="section-spacer">Auf ausgewählte neue Untersuchungen übertragen</button></details>`:''}</section>
  <section class="card"><h2>Ihre ausgewählten Dateien</h2>${rows.map(row=>`<article class="import-item" data-row="${row.id}" id="file-${row.id}"><div class="file-title"><div><h3>${row.document?fmtDate(row.document.date):'PDF-Bericht'}</h3><small class="filename">${escape(row.name)}</small>${row.document?`<small>Initialen aus Export: ${escape(sourceValue(row.document,'demographics_patient_initials')||'nicht angegeben')} · ${escape(row.document.timeText||'Uhrzeit nicht angegeben')}</small>`:''}</div>${pill(row.error?'Nicht verwendbar':status[row.status],row.error?'error':row.status==='revision'?'warn':'')}</div>${row.error?`<div class="note error">Diese Datei wird ausgelassen: ${escape(row.error)}</div>`:['duplicate','duplicate-in-batch'].includes(row.status)?'<p class="muted">Diese Datei ist bereits vorhanden und wird nicht erneut gespeichert.</p>':`
  <label class="check"><input data-field="included" type="checkbox" ${row.included?'checked':''}>Diese Datei übernehmen</label>
  ${row.kind==='csv'?`<div class="form-row section-spacer"><label>Individueller Patient<select data-field="patientChoice">${patientOptions(row.patientChoice)}</select></label><label>Numerische Aufenthalts-ID<input data-field="stayId" inputmode="numeric" maxlength="100" value="${escape(row.stayId)}" placeholder="z. B. 0006789"></label></div><label class="section-spacer">Untersuchungsart<select data-field="assessmentTypeId">${typeOptions(row.assessmentTypeId)}</select></label>
  ${row.status==='new'?'<input data-field="action" type="hidden" value="new"><p class="quiet section-spacer">Wird als neue Untersuchung aufgenommen.</p>':`<div class="note">Zu dieser Sitzung gibt es bereits eine Untersuchung. ${row.equivalent?'Die Werte sind gleich; die Dateidarstellung unterscheidet sich.':`${row.changes?.length??'?'} Quellfelder unterscheiden sich.`}${row.contextConflict?' Datum oder demografische Angaben weichen ab. Bitte prüfen, ob es wirklich dieselbe Untersuchung ist.':''}</div><label>Wie möchten Sie mit der Datei umgehen?<select data-field="action">${option('','Bitte auswählen',row.action)}${option('keep','Neue Fassung erhalten; bisherige weiter anzeigen',row.action)}${option('select','Neue Fassung erhalten und künftig anzeigen',row.action)}${option('separate','Als getrennte Untersuchung anlegen',row.action)}</select></label><label class="section-spacer">Bisherige Untersuchung<select data-field="target">${option('','Untersuchung auswählen',row.target)}${(row.matches||[]).map(id=>option(id,titleOf(state().assessments[id]),row.target)).join('')}</select></label><details><summary>Änderungen der Quellwerte ansehen</summary><pre>${escape((row.changes||[]).map(k=>`${k}: ${JSON.stringify(row.comparisonDocument?.normalized[k])} → ${JSON.stringify(row.document.normalized[k])}`).join('\n')||'Keine Wertunterschiede erkannt.')}</pre></details>`}
  <details><summary>Weitere Angaben zur Quelldatei</summary><pre>${escape(row.document.warnings.join('\n'))}\n\n${escape(JSON.stringify(row.document.raw,null,2))}</pre></details>`:
  `<label class="section-spacer">Zu welcher Untersuchung gehört dieser Bericht?<select data-field="target">${option('','Bitte auswählen',row.target)}${option('unlinked','Zuordnung bewusst für später offen lassen',row.target)}${rows.filter(r=>r.kind==='csv'&&!r.error&&!['duplicate','duplicate-in-batch'].includes(r.status)).map(r=>option('batch:'+r.id,'Aus dieser Auswahl: '+fmtDate(r.document.date)+' · '+r.name,row.target)).join('')}${Object.values(state().assessments).map(a=>option('existing:'+a.id,titleOf(a),row.target)).join('')}</select></label>${row.suggestions?.length===1?`<button class="section-spacer" data-use-suggestion="${row.id}">Dateinamen-Vorschlag übernehmen</button>`:''}<p class="quiet section-spacer">${row.suggestions?.length?'Es gibt passende Dateinamen. Prüfen Sie die Zuordnung selbst.':'Der Dateiname ergibt keine eindeutige Zuordnung.'} Bericht und CSV können zu unterschiedlichen Zeitpunkten exportiert worden sein.</p>`}
  ${(row.kind==='pdf'||row.status==='revision')?`<label class="section-spacer">${row.kind==='pdf'?'Kurze Begründung für die Zuordnung':'Grund für die neue Fassung oder getrennte Untersuchung'}<textarea data-field="note" maxlength="2000" placeholder="z. B. Bericht und Untersuchungsdatum geprüft">${escape(row.note)}</textarea></label>`:''}
  <label class="check section-spacer"><input data-field="confirmed" type="checkbox" ${row.confirmed?'checked':''}>${row.kind==='csv'?'Patient, Aufenthalt und Untersuchungsart sind geprüft.':'Die Zuordnung bzw. offene Ablage dieses Berichts ist geprüft.'}</label>`}</article>`).join('')}
  <div class="actions section-spacer"><button data-import-stage="1">← Dateiauswahl ändern</button><button class="primary" id="review-import" data-import-stage="3">Weiter zur Zusammenfassung →</button></div></section>`:''}
  ${importStage===3?`<section class="card"><h2>3 · Prüfen Sie die Zusammenfassung</h2><p class="muted">${active.length} neue Dateien werden gemeinsam in Ihrer Bibliothek gespeichert. Bereits vorhandene, fehlerhafte und abgewählte Dateien werden ausgelassen.</p>${active.length?`<div class="table-wrap"><table><thead><tr><th>Datei</th><th>Zuordnung</th><th>Noch zu tun</th></tr></thead><tbody>${active.map(r=>`<tr><td class="filename">${escape(r.name)}</td><td>${r.kind==='csv'?`${escape(r.patientChoice==='unresolved'?'Bewusst noch kein Patient':patients().find(p=>p.id===r.patientChoice)?.identifier??'Patient prüfen')} · Aufenthalt ${escape(r.stayId)}<small class="assessment-type">${escape(assessmentTypeLabel(r.assessmentTypeId))}</small>`:escape(r.target==='unlinked'?'Zuordnung bleibt bewusst offen':r.target?'Bericht wird mit der gewählten Untersuchung verknüpft':'Bericht noch zuordnen')}</td><td>${rowProblems(r).length?`<button class="link" data-review-row="${r.id}">${escape(rowProblems(r).join(' · '))}</button>`:pill('Geprüft')}</td></tr>`).join('')}</tbody></table></div>`:''}${!active.length?'<div class="note">Es sind keine neuen Dateien zum Speichern ausgewählt.</div>':pending.length?`<div class="note">Bei ${pending.length} Dateien fehlen noch Angaben oder die Bestätigung. Über „Angaben ergänzen“ können Sie direkt zurückgehen.</div>`:'<div class="note good">Alle ausgewählten Dateien sind zugeordnet und geprüft. Sie können jetzt speichern.</div>'}<details><summary>Bearbeiterkürzel ergänzen (freiwillig)</summary><label class="section-spacer">Kürzel<input id="actor" maxlength="100" placeholder="Lokales Kürzel; keine Anmeldung"></label></details><div class="actions section-spacer"><button data-import-stage="2">← Angaben ergänzen</button><button id="commit-import" class="primary" ${!writable()||!active.length||pending.length?'disabled':''}>${active.length} Dateien in Bibliothek speichern</button></div><p class="quiet section-spacer">Die Originalwerte werden unverändert übernommen. Erst nach erfolgreichem Speichern und erneuter Prüfung erscheint die Bestätigung.</p></section>`:''}`;
}
function originalCard(a) {
  return `<div class="cap-row"><div><strong class="filename">${escape(a.name)}</strong><small>${a.kind==='pdf'?'Originalbericht':'Originale CSV-Datei'}</small><details><summary>Herkunft der Datei</summary><p class="quiet">${escape(a.note||'Bei der Übernahme ausdrücklich zugeordnet.')}</p><p class="mono">SHA-256: ${escape(a.hash)}</p><p class="quiet">${escape(a.method)}</p></details></div><div class="actions">${a.kind==='pdf'?`<button data-report="${a.id}">Bericht ansehen</button>`:''}<button data-download="${a.id}">Dateikopie herunterladen</button></div></div>`;
}
function detailView() {
  if(detailError)return `<section class="card"><h1>Untersuchung konnte nicht geöffnet werden</h1><p>${escape(detailError)}</p><button data-nav="recovery">Zur Prüfung & Hilfe</button></section>`;
  const a=detailData?.id===currentId?detailData:state().assessments[currentId];if(!a)return '<p>Untersuchung nicht gefunden.</p>';
  const r=selectedRevision(a),d=r?.document;if(d?.projected)return '<div class="card loading">Die Untersuchung wird geöffnet…</div>';
  const groups=new Map();for(const key of d?.headers??[]){const family=key.startsWith('demographics_')?'demographics':key.split('_')[0];if(!groups.has(family))groups.set(family,[]);groups.get(family).push(key);}
  const measures=SUMMARY_MEASURES.filter(([key])=>d?.raw[key]&&!d.raw[key].missing&&d.raw[key].raw!=='');
  const notes=(d?.headers??[]).filter(k=>/(?:notes|note)(?:_|$)/.test(k)&&d.raw[k].raw);
  return `<div class="heading"><div><div class="eyebrow">Untersuchung vom ${fmtDate(d?.date)}</div><h1>${escape(patientText(a.patientId))}</h1><p class="muted">Aufenthalt ${escape(a.stayId)} · ${escape(d?.timeText||'Uhrzeit nicht angegeben')}</p><p class="assessment-type">${escape(assessmentTypeLabel(a.assessmentTypeId))}</p></div><div class="actions"><button data-nav="assessments">← Alle Untersuchungen</button>${a.patientId?`<button data-patient="${a.patientId}">Patientenverlauf ansehen</button>`:''}</div></div>
  <section class="card"><h2>Originalberichte</h2>${a.attachments.map(originalCard).join('')||'<p class="muted">Für diese Untersuchung ist noch kein Bericht hinterlegt. Sie können ihn später über „Importieren“ ergänzen.</p>'}</section>
  <section class="card"><h2>Werte aus der ausgewählten Quelldatei</h2><p class="muted">Diese Übersicht zeigt ausgewählte Werte so, wie sie exportiert wurden. Es werden keine Werte neu berechnet oder klinisch interpretiert.</p>${measures.length?`<div class="table-wrap"><table><thead><tr><th>Verfahren / Messwert</th><th>Exportierter Wert</th><th>Hinweise aus der Quelle</th></tr></thead><tbody>${measures.map(([key,label,unit,family])=>`<tr><td>${escape(label)}</td><td><strong>${escape(d.raw[key].raw)}</strong><small>${escape(unit)}</small></td><td>${measureContext(d,family).map(escape).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Für diese Übersicht sind keine Messwerte exportiert. Fehlende Werte werden nicht als Null behandelt.</p>'}<p class="quiet section-spacer">Ein einzelner Wert oder ein Abbruchflag 0 beweist keine vollständige Durchführung. Alle Quelldaten stehen weiter unten unverändert zur Verfügung.</p></section>
  ${notes.length?`<section class="card"><h2>Notizen aus dem Export</h2>${notes.map(key=>`<details><summary>${escape(key)}</summary><p class="source-note">${escape(d.raw[key].raw)}</p></details>`).join('')}</section>`:''}
  <div class="grid2"><details class="card"><summary>Patient, Aufenthalt oder Untersuchungsart korrigieren</summary><p class="quiet section-spacer">Die Änderung wird mit Begründung gespeichert. Frühere Zuordnungen bleiben in der Historie erhalten; die Quelldatei wird nicht verändert.</p><label>Individueller Patient<select id="reassign-patient">${patientOptions(a.patientId??'unresolved')}</select></label><label class="section-spacer">Aufenthalts-ID<input id="reassign-stay" inputmode="numeric" value="${escape(a.stayId)}" maxlength="100"></label><label class="section-spacer">Untersuchungsart<select id="reassign-type">${typeOptions(a.assessmentTypeId??'')}</select></label><label class="section-spacer">Grund für die Änderung<textarea id="reassign-reason" maxlength="2000"></textarea></label><button id="save-assignment" class="section-spacer" ${!writable()?'disabled':''}>Änderung mit Historie speichern</button></details>
  <details class="card"><summary>Gespeicherte Fassungen und CSV-Dateien (${a.revisions.length})</summary><p class="quiet section-spacer">Geänderte Exporte bleiben als eigene Fassungen erhalten. Die Auswahl legt fest, welche Werte in der Bibliothek angezeigt werden.</p><label>Für die Anzeige ausgewählte Fassung<select id="selected-revision">${a.revisions.map((v,i)=>option(v.id,`${i+1} · ${v.original.name} · ${v.reason}`,a.selectedRevisionId)).join('')}</select></label><button id="select-revision" class="section-spacer" ${!writable()?'disabled':''}>Diese Fassung künftig anzeigen</button>${a.revisions.map(v=>originalCard(v.original)).join('')}</details></div>
  <details class="card"><summary>Alle unveränderten Originalfelder (${d?.headers.length??0})</summary><p class="quiet section-spacer">„Nicht überliefert“ und eine exportierte leere Zeichenfolge bleiben verschieden. Unbekannte Felder und exportierte Bewertungs-/Variantenversionen sind erhalten.</p>${[...groups].map(([family,keys])=>`<details><summary>${escape(family.toUpperCase())} · ${keys.length} Felder</summary><div class="table-wrap section-spacer"><table class="value-table"><thead><tr><th>Originalfeld</th><th>Originalwert</th><th>Zellstatus</th></tr></thead><tbody>${keys.map(key=>{const cell=d.raw[key];return `<tr><td>${escape(key)}</td><td>${cell.missing?'<em class="muted">Nicht überliefert</em>':cell.raw===''?'<em class="muted">Leere Zeichenfolge</em>':escape(cell.raw)}</td><td>${cell.missing?'Unquotiert leer':cell.quoted?'Quotiert':'Text'}${d.unknownFields.includes(key)?' · unbekanntes Feld':''}</td></tr>`;}).join('')}</tbody></table></div></details>`).join('')}</details>
  <details class="card"><summary>Herkunft und gespeicherte Änderungen</summary><dl class="provenance section-spacer"><dt>Quellsitzung</dt><dd class="mono">${escape(a.sessionId)}</dd><dt>Erzeugerversion</dt><dd>Im CSV nicht angegeben</dd><dt>Importadapter</dt><dd>${escape(d?.parserVersion)}</dd><dt>Originaldatum</dt><dd>${escape(d?.dateText||'Nicht angegeben')}</dd><dt>Zeitzone</dt><dd>Im CSV nicht angegeben</dd></dl>${state().history.filter(h=>h.operations.some(o=>o.assessmentId===a.id||o.assessment?.id===a.id)).map(h=>`<div class="history-entry"><strong>${escape(h.createdAt)}</strong><small>${escape(h.actor||'Ohne Bearbeiterkürzel')}</small>${h.operations.filter(o=>o.assessmentId===a.id||o.assessment?.id===a.id).map(o=>`<p class="quiet">${escape(({ 'assessment.create':'Untersuchung angelegt','revision.add':'Quelldatei/Fassung hinzugefügt','revision.select':'Anzeigefassung ausgewählt','patient.link':'Patientenzuordnung geändert','stay.update':'Aufenthalts-ID geändert','assessment.type.set':'Untersuchungsart zugeordnet','attachment.add':'Bericht ergänzt','attachment.link':'Bericht zugeordnet' })[o.type]||'Eintrag ergänzt')} ${escape(o.reason||o.revision?.reason||'')}${o.assessmentTypeId?' · '+escape(assessmentTypeLabel(o.assessmentTypeId)):''}</p>`).join('')}</div>`).join('')}</details>`;
}

const comparisonMeasures = [['tmt_a_s','TMT A','Sekunden'],['tmt_b_s','TMT B','Sekunden'],['phq9_total','PHQ-9','Punkte'],['moca_total','MoCA','Punkte'],['qolie31_overall','QOLIE-31','Quellwert']];
let comparisonKey = 'tmt_a_s';
function patientsView() {
  const all=Object.values(state().assessments);
  const list=Object.values(state().patients).filter(p=>(!patientQuery||`${p.identifier} ${p.label}`.toLocaleLowerCase('de').includes(patientQuery.toLocaleLowerCase('de')))&&(!filterType||all.some(a=>a.patientId===p.id&&matchesAssessmentType(a,filterType)))).sort((a,b)=>a.identifier.localeCompare(b.identifier,undefined,{numeric:true}));
  if(currentPatient&&!list.some(p=>p.id===currentPatient))currentPatient='';
  const p=state().patients[currentPatient];
  const visits=p?all.filter(a=>a.patientId===p.id&&matchesAssessmentType(a,filterType)).sort((a,b)=>(selectedRevision(a)?.document.date??'9999').localeCompare(selectedRevision(b)?.document.date??'9999')):[];
  const m=comparisonMeasures.find(x=>x[0]===comparisonKey);
  const shown=list.slice(0,200);if(p&&!shown.some(x=>x.id===p.id))shown.push(p);
  return `<div class="heading"><div><div class="eyebrow">Besuche gemeinsam betrachten</div><h1>Patienten und Verläufe</h1><p class="muted">Eine individuelle Patienten-ID verbindet Untersuchungen über verschiedene Aufenthalte hinweg.</p></div></div><section class="card"><div class="form-row"><label>Patienten suchen<input id="patient-search" type="search" value="${escape(patientQuery)}" placeholder="Patienten-ID oder lokales Kürzel"></label><label>Untersuchungsart<select id="patient-type-filter">${typeOptions(filterType,true)}</select></label></div><label class="section-spacer">Patient auswählen<select id="history-patient">${option('','Bitte Patient auswählen',currentPatient)}${shown.map(p=>option(p.id,`${p.identifier}${p.label?' · '+p.label:''}`,currentPatient)).join('')}</select></label><p class="quiet section-spacer">${list.length} passende Patienten${list.length>200?' · Bitte die Suche eingrenzen; bis 200 Treffer werden direkt angeboten.':''}</p><details><summary>Neue Patienten-ID für eine spätere Zuordnung anlegen</summary><form id="create-patient" class="section-spacer"><div class="form-row"><label>Numerische Patienten-ID<input name="identifier" inputmode="numeric" pattern="[0-9]+" maxlength="100" required></label><label>Lokales Kürzel (optional)<input name="label" maxlength="200"></label><button type="submit" ${!writable()?'disabled':''}>Patienten-ID speichern</button></div></form></details></section>
  ${p?`<section class="card"><h2>Patient ${escape(p.identifier)}${p.label?' · '+escape(p.label):''}</h2><p class="muted">${visits.length} passende Untersuchungen · ${new Set(visits.map(a=>a.stayId)).size} Aufenthalte</p>${visits.map(a=>`<div class="history-entry"><strong>${fmtDate(selectedRevision(a)?.document.date)} · Aufenthalt ${escape(a.stayId)}</strong><p class="assessment-type">${escape(assessmentTypeLabel(a.assessmentTypeId))}</p><small>${a.attachments.length} Berichte · ${a.revisions.length} gespeicherte Fassungen</small><button class="link" data-detail="${a.id}">Untersuchung ansehen →</button></div>`).join('')||'<p>Für diesen Patienten gibt es noch keine passenden Untersuchungen.</p>'}</section>
  <section class="card"><h2>Exportierte Werte im Verlauf</h2><p class="muted">Die Werte stehen unverändert nebeneinander. Unterschiedliche Varianten, Eingabearten und unvollständige Ergebnisse müssen bei einem fachlichen Vergleich berücksichtigt werden.</p><label>Messwert<select id="comparison-measure">${comparisonMeasures.map(([k,l,u])=>option(k,`${l} · ${u}`,comparisonKey)).join('')}</select></label>${patientValueKey===currentPatientValueKey()?`<div class="table-wrap section-spacer"><table><thead><tr><th>Datum / Aufenthalt</th><th>${escape(m[1])} (${escape(m[2])})</th><th>Hinweise aus dem Export</th></tr></thead><tbody>${visits.map(a=>{const d=patientValueDocs.get(a.id);const cell=d?.raw[comparisonKey];const family=comparisonKey.startsWith('tmt')?comparisonKey.slice(0,5):comparisonKey.split('_')[0];return `<tr><td>${fmtDate(d?.date)}<small>${escape(a.stayId)}</small></td><td><strong>${!cell||cell.missing||cell.raw===''?'—':escape(cell.raw)}</strong></td><td>${measureContext(d,family).map(escape).join('<br>')}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="quiet section-spacer">Die Quellwerte werden erst bei Bedarf aus den Originaldateien geladen und geprüft.</p><button id="load-patient-values" class="section-spacer">Exportierte Messwerte laden</button>'}<p class="quiet section-spacer">Keine Normierung, Neuberechnung oder automatische Aussage zur Vergleichbarkeit. Fehlende Werte bleiben Lücken. Die erste Messwertauswahl ist vorläufig.</p></section>`:`<section class="card empty"><div class="empty-icon">♧</div><h2>Wessen Verlauf möchten Sie ansehen?</h2><p class="muted">Wählen Sie oben einen Patienten. Mit der Untersuchungsart können Sie Patienten und Besuche eingrenzen.</p></section>`}`;
}

function recoveryView() {
  const issues = archive.snapshot.issues;
  return `<div class="heading"><div><div class="eyebrow">Bestand erhalten</div><h1>Sicherung & Wiederherstellung</h1><p class="muted">Hier können Sie Ihre Bibliothek prüfen, eine vollständige Sicherheitskopie erstellen und offene Berichte zuordnen.</p></div><button id="refresh-archive" ${busy?'disabled':''}>Bibliothek prüfen & Übersicht erneuern</button></div>
  <div class="grid2"><section class="card"><h2>Prüfstatus</h2>${pill(archive.snapshot.readOnly?'Prüfung erforderlich':archive.snapshot.verification==='full'?'Originaldateien vollständig geprüft':'Bibliothek bereit',archive.snapshot.readOnly?'error':'')}<details><summary>Technische Angaben zur Bibliothek</summary><dl class="provenance section-spacer"><dt>Speichervorgänge</dt><dd>${archive.snapshot.records.length}</dd><dt>Archiv-ID</dt><dd class="mono">${escape(archive.snapshot.manifest.archiveId)}</dd><dt>Letzte Speicherung</dt><dd class="mono">${escape(archive.snapshot.head || 'Noch keiner')}</dd></dl></details><p class="quiet">Beim normalen Öffnen wird eine leichte Suchübersicht verwendet. Originale werden beim Öffnen geprüft. Die vollständige Prüfung liest alle gespeicherten Vorgänge und Originaldateien unabhängig von der Übersicht; sie kann länger dauern und baut die Übersicht bei Schreibfreigabe neu auf.</p></section>
  <section class="card"><h2>Eine Sicherheitskopie erstellen</h2><p class="muted">Als zusätzliche Sicherung einen anderen, leeren Ordner auswählen. Originaldateien und sämtliche Metadaten werden kopiert und erneut geprüft. Nicht gleichzeitig importieren.</p><button id="backup-archive" ${busy||archive.snapshot.readOnly?'disabled':''}>Sicherheitskopie in anderem Ordner erstellen</button><p class="quiet section-spacer">Die automatische IT-Sicherung bleibt maßgeblich. Für eine Wiederherstellung die vollständige Sicherung in einen separaten Ordner kopieren und dort über „Archivordner öffnen“ vollständig prüfen. Nie einzelne CSV ohne Commit-Metadaten als vollständiges Archiv behandeln.</p></section></div>
  <section class="card"><h2>Wiederherstellungshinweise</h2>${issues.length?issues.map(i=>`<div class="note ${i.severity==='error'?'error':''}"><strong>${escape(i.message)}</strong><br><span class="mono">${escape(i.path)}</span></div>`).join(''):'<p class="muted">Keine beschädigten oder unvollständigen Speichereinträge erkannt.</p>'}<p class="quiet">Nichts wird automatisch gelöscht, repariert oder überschrieben. Bei Fehlern: Ordner unverändert sichern, IT-Wiederherstellung in einen anderen Ordner durchführen und erneut prüfen. Nach verweigerter Berechtigung oder getrenntem Netzlaufwerk den Ordner neu auswählen.</p></section>
  <section class="card"><h2>Unzugeordnete PDF-Dateien (${Object.keys(state().unlinked).length})</h2>${Object.values(state().unlinked).map(a=>`<article class="import-item" data-unlinked="${a.id}">${originalCard(a)}<label class="section-spacer">Testung auswählen<select data-link-target>${option('','Bitte wählen','')}${Object.values(state().assessments).map(v=>option(v.id,titleOf(v),'')).join('')}</select></label><label class="section-spacer">Warum gehört dieser Bericht zur Untersuchung?<textarea data-link-note maxlength="2000"></textarea></label><button data-link-attachment="${a.id}" class="section-spacer" ${!writable()?'disabled':''}>Bericht zuordnen</button></article>`).join('')||'<p class="muted">Keine offenen PDF-Verknüpfungen.</p>'}</section>`;
}
const views = { storage: storageView, assessments: assessmentsView, import: importView, detail: detailView, patients: patientsView, recovery: recoveryView };
async function commit(operations, files = new Map(), actor = '') {
  if (!archive || !writer || !singleWriter || archive.snapshot.readOnly) fail('Schreibfreigabe fehlt. Ordner und Einzelzugriff prüfen.');
  await permission(archive.storage.handle,'readwrite',true);
  await archive.commit(operations, files, actor);
  patientValueDocs.clear();patientValueKey='';
  if(page==='detail'&&currentId)detailData=await archive.assessmentDetail(currentId);
}
async function openDetail(id) {
  currentId=id;detailData=null;detailError='';page='detail';
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
  const frame=$('#report-frame');const token=uid();pendingReport={data,token};frame.src='./pdf-viewer.html#'+token;
  $('#report-dialog').showModal();
}
function bind() {
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{if(busy)return;page=b.dataset.nav;render();});
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>openDetail(b.dataset.detail));
  document.querySelectorAll('[data-patient]').forEach(b=>b.onclick=()=>{currentPatient=b.dataset.patient;filterType='';patientQuery='';page='patients';render();});
  document.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>run(()=>downloadOriginal(b.dataset.download)));
  document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>run(()=>openReport(b.dataset.report)));
  if($('#single-writer'))$('#single-writer').onchange=e=>{singleWriter=e.target.checked;render();};
  if($('#open-folder'))$('#open-folder').onclick=()=>run(()=>openFolder(false,page==='storage'?'assessments':page));
  if($('#create-folder'))$('#create-folder').onclick=()=>run(()=>openFolder(true,page==='storage'?'assessments':page));
  if($('#activate-folder'))$('#activate-folder').onclick=()=>{const target=$('#activate-folder').dataset.activateFolder;run(()=>activateSelected(target));};
  if($('#probe-folder'))$('#probe-folder').onclick=()=>run(async()=>{
    lastProbe='';probeError=null;probeProgress='Ordner auswählen';
    try {const storage=await pick();lastProbe=await probeFolder(storage,step=>{probeProgress=step;render();});await rememberFolder(storage);notice(lastProbe+' Ausgewählten Ordner über die Ordnerkarte aktivieren.');}
    catch(error){probeError={message:error.message,details:error.details};throw error;}
    finally{probeProgress='';}
  });
  if($('#refresh-archive'))$('#refresh-archive').onclick=()=>run(async()=>{if(writer&&singleWriter){await permission(archive.storage.handle,'readwrite',true);await archive.rebuildIndex();}else{await permission(archive.storage.handle,'read');await archive.refresh({deep:true});}notice('Die vollständige Prüfung ist abgeschlossen. Bitte den angezeigten Prüfstatus beachten.');});
  if($('#backup-archive'))$('#backup-archive').onclick=()=>run(async()=>{const target=await pick();const result=await copyArchive(archive.storage,target);notice(`Sicherung geprüft: ${result.files} Dateien vollständig kopiert. Öffnen Sie den Sicherungsordner zur Wiederherstellungsprobe.`);});
  if($('#search'))$('#search').oninput=e=>{query=e.target.value;listPage=0;const pos=e.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(pos,pos);};
  if($('#patient-filter'))$('#patient-filter').onchange=e=>{filterPatient=e.target.value;listPage=0;render();};
  if($('#measure-filter'))$('#measure-filter').onchange=e=>{measure=e.target.value;listPage=0;render();};
  for(const selector of ['#assessment-type-filter','#patient-type-filter'])if($(selector))$(selector).onchange=e=>{filterType=e.target.value;listPage=0;render();};
  if($('#clear-filters'))$('#clear-filters').onclick=()=>{filterType='';query='';filterPatient='';measure='';listPage=0;render();};
  if($('#patient-search'))$('#patient-search').oninput=e=>{patientQuery=e.target.value;const pos=e.target.selectionStart;render();$('#patient-search').focus();$('#patient-search').setSelectionRange(pos,pos);};
  if($('#list-previous'))$('#list-previous').onclick=()=>{listPage--;render();};
  if($('#list-next'))$('#list-next').onclick=()=>{listPage++;render();};
  if($('#history-patient'))$('#history-patient').onchange=e=>{currentPatient=e.target.value;render();};
  if($('#comparison-measure'))$('#comparison-measure').onchange=e=>{comparisonKey=e.target.value;render();};
  if($('#load-patient-values'))$('#load-patient-values').onclick=()=>run(async()=>{
    const docs=new Map();
    try{for(const a of Object.values(state().assessments).filter(a=>a.patientId===currentPatient&&matchesAssessmentType(a,filterType))){const full=await archive.assessmentDetail(a.id);docs.set(a.id,selectedRevision(full)?.document);}}
    catch(error){archive.snapshot.readOnly=true;archive.snapshot.issues.push({severity:'error',path:'Quelldateien',message:error.message});throw error;}
    patientValueDocs=docs;patientValueKey=currentPatientValueKey();
  });
  const load=files=>run(async()=>{if(!writer||!singleWriter||archive.snapshot.readOnly)fail('Bitte zuerst bestätigen, dass Sie die Bibliothek gerade allein bearbeiten.');rows=await inspectFiles([...files],state(),columns,async(id,revisionId)=>{const full=await archive.assessmentDetail(id);return full.revisions.find(r=>r.id===revisionId).document;});for(const row of rows)if(row.status==='new')row.action='new';importStage=2;notice('Dateien ausgewählt. Ordnen Sie jetzt Patienten, Aufenthalte und Untersuchungsarten zu.');});
  document.querySelectorAll('[data-import-stage]').forEach(button=>button.onclick=()=>{if(busy||button.disabled)return;importStage=Number(button.dataset.importStage);render();window.scrollTo({top:0});});
  document.querySelectorAll('[data-review-row]').forEach(button=>button.onclick=()=>{importStage=2;render();$('#file-'+button.dataset.reviewRow)?.scrollIntoView({block:'center'});});
  document.querySelectorAll('[data-use-suggestion]').forEach(button=>button.onclick=()=>{const row=rows.find(r=>r.id===button.dataset.useSuggestion);row.target=row.suggestions[0];row.confirmed=false;render();});
  if($('#apply-bulk'))$('#apply-bulk').onclick=()=>{const patient=$('#bulk-patient').value,stay=$('#bulk-stay').value,type=$('#bulk-type').value;for(const row of rows.filter(r=>r.included&&r.kind==='csv'&&r.status==='new')){if(patient)row.patientChoice=patient;if(stay)row.stayId=stay;if(type)row.assessmentTypeId=type;row.confirmed=false;}render();notice('Angaben übertragen. Bitte jede Datei noch einmal prüfen und bestätigen.');};
  if($('#import-files'))$('#import-files').onchange=e=>load(e.target.files);
  if($('#drop-zone')){const zone=$('#drop-zone');zone.ondragover=e=>e.preventDefault();zone.ondrop=e=>{e.preventDefault();load(e.dataTransfer.files);};}
  if($('#add-patient'))$('#add-patient').onsubmit=e=>{
    e.preventDefault();const data=new FormData(e.target);const identifier=String(data.get('identifier'));const label=String(data.get('label'));
    if(!/^[0-9]{1,100}$/.test(identifier)){notice('Numerische Patienten-ID erforderlich.',true);return;}
    if(patients().some(p=>p.identifier===identifier)){notice('Patienten-ID bereits vorhanden. In der Zuordnung auswählen.',true);return;}
    pendingPatients.push({id:uid(),identifier,label});render();notice('Patient vorgemerkt; erst der Import speichert ihn dauerhaft.');
  };
  if($('#create-patient'))$('#create-patient').onsubmit=e=>{
    e.preventDefault();const data=new FormData(e.target);const patient={id:uid(),identifier:String(data.get('identifier')),label:String(data.get('label'))};
    run(async()=>{await commit([{type:'patient.create',patient}]);currentPatient=patient.id;filterType='';patientQuery='';notice('Patienten-ID dauerhaft gespeichert. Testung öffnen, um die Zuordnung mit Begründung zu korrigieren.');});
  };
  document.querySelectorAll('[data-row]').forEach(node=>{
    const row=rows.find(r=>r.id===node.dataset.row);
    node.querySelectorAll('[data-field]').forEach(input=>input.onchange=async()=>{
      row[input.dataset.field]=input.type==='checkbox'?input.checked:input.value;
      if(input.dataset.field!=='confirmed'){row.confirmed=false;const confirm=node.querySelector('[data-field="confirmed"]');if(confirm)confirm.checked=false;}
      if(input.dataset.field==='target'&&row.kind==='csv'&&state().assessments[row.target]){await run(async()=>{const a=await archive.assessmentDetail(row.target);const document=selectedRevision(a)?.document;row.comparisonDocument=document;row.changes=document?changedFields(document,row.document):[];row.patientChoice=a.patientId??'unresolved';row.stayId=a.stayId;row.assessmentTypeId=a.assessmentTypeId??'';});return;}
      if(input.tagName==='SELECT')render();
    });
  });
  if($('#commit-import'))$('#commit-import').onclick=()=>{const actor=$('#actor')?.value??'';run(async()=>{
    const selectedIds=new Set(rows.filter(r=>r.included).map(r=>r.patientChoice));
    const built=buildImport(rows,state(),pendingPatients.filter(p=>selectedIds.has(p.id)));
    await commit(built.operations,built.files,actor);rows=[];pendingPatients=[];importStage=1;query='';filterType='';filterPatient='';listPage=0;page='assessments';notice(`${built.count} Dateien in Ihrer Bibliothek gespeichert und erneut geprüft.`);
  });};
  if($('#save-assignment'))$('#save-assignment').onclick=()=>{
    const patientId=$('#reassign-patient').value==='unresolved'?null:$('#reassign-patient').value;const stayId=$('#reassign-stay').value;const reason=$('#reassign-reason').value;const type=$('#reassign-type').value;
    run(async()=>{const operations=[{type:'patient.link',assessmentId:currentId,patientId,reason},{type:'stay.update',assessmentId:currentId,stayId,reason}];if(type)operations.push({type:'assessment.type.set',assessmentId:currentId,assessmentTypeId:type,reason});await commit(operations);notice('Zuordnung und Untersuchungsart mit Historie gespeichert.');});
  };
  if($('#select-revision'))$('#select-revision').onclick=()=>{const revisionId=$('#selected-revision').value;run(async()=>{await commit([{type:'revision.select',assessmentId:currentId,revisionId}]);notice('Revisionsauswahl dauerhaft gespeichert.');});};
  document.querySelectorAll('[data-link-attachment]').forEach(b=>b.onclick=()=>{const parent=b.closest('[data-unlinked]');const assessmentId=parent.querySelector('[data-link-target]').value;const note=parent.querySelector('[data-link-note]').value;run(async()=>{await commit([{type:'attachment.link',attachmentId:b.dataset.linkAttachment,assessmentId,note}]);notice('Anhang mit Zuordnungshistorie gespeichert.');});});
}
$('#close-report').onclick=()=>$('#report-dialog').close();
$('#report-dialog').onclose=()=>{pendingReport=null;$('#report-frame').src='about:blank';};
window.addEventListener('message',event=>{
  const frame=$('#report-frame');
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='npt-pdf-ready'||!pendingReport||event.data.token!==pendingReport.token)return;
  const {data,token}=pendingReport;pendingReport=null;
  frame.contentWindow.postMessage({type:'npt-local-pdf',token,data:data.buffer},location.origin,[data.buffer]);
});
render();
