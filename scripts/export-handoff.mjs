// Run only on the development computer. Hospital delivery receives static files plus separate reviewable source.
import { readdir,readFile,mkdir,writeFile,lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { APP_VERSION } from '../src/shared.js';
import { createHospitalTestKit } from './hospital-test-kit.mjs';
import { zipFiles } from './zip.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const stamp=new Date().toISOString().replace(/[-:.]/g,'');
const out=join(root,'releases',`handoff-${APP_VERSION}-${stamp}`);await mkdir(out,{recursive:true});
async function walk(directory,prefix='',allowed=null){
 const result=[];
 for(const item of await readdir(directory,{withFileTypes:true})){
  const name=prefix?`${prefix}/${item.name}`:item.name,path=join(directory,item.name);
  if(item.isSymbolicLink())throw Error(`Symlink excluded from handoff: ${name}`);
  if(item.isDirectory())result.push(...await walk(path,name,allowed));
  else if(item.isFile()&&(!allowed||allowed(name)))result.push({path,name});
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name));
}
const release=JSON.parse(await readFile(join(root,'dist/RELEASE.json')));if(release.appVersion!==APP_VERSION)throw Error('Build and source versions differ. Run npm run export:hospital.');
const runtime=await walk(join(root,'dist'));
if(runtime.some(e=>/\.(csv|pdf)$/.test(e.name)||/^(objects|records|fixtures)\//.test(e.name)))throw Error('Unexpected data in static release.');
const source=[];
for(const name of ['README.md','package.json','package-lock.json','.gitignore','.gitattributes','vercel.json'])source.push({path:join(root,name),name});
for(const directory of ['src','scripts','tests','docs'])source.push(...(await walk(join(root,directory),'',name=>directory==='src'?/\.(js|css|html)$/.test(name)||name==='export-columns.json':directory==='docs'?/\.(md|html)$/.test(name):name.endsWith('.mjs'))).map(e=>({...e,name:`${directory}/${e.name}`})));
const synthetic=['README.md','empty-assessment.csv','revised-same-session.csv','2026-01-15_08-30_SYNTH_00000000-0000-4000-8000-000000000001.csv','2026-01-15_08-30_SYNTH_00000000-0000-4000-8000-000000000001.pdf'];
for(const name of synthetic){const path=join(root,'fixtures',name);if(!(await lstat(path)).isFile())throw Error('Synthetic fixture must be a regular file');source.push({path,name:`fixtures/${name}`});}
await zipFiles(join(out,'static-application.zip'),runtime);await zipFiles(join(out,'source-code.zip'),source);
const digest=async name=>createHash('sha256').update(await readFile(join(out,name))).digest('hex');
const frozen={createdAt:new Date().toISOString(),staticSha256:await digest('static-application.zip'),sourceSha256:await digest('source-code.zip')};
const kitDirectory=join(out,'hospital-test-kit');const kit=await createHospitalTestKit(kitDirectory,frozen);await zipFiles(join(out,'hospital-test-kit.zip'),await walk(kitDirectory));
const hashes=[];for(const name of ['static-application.zip','source-code.zip','hospital-test-kit.zip'])hashes.push(await digest(name)+'  '+name);
await writeFile(join(out,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
let browser=null;try{const evidence=JSON.parse(await readFile(join(root,'test-results/browser-summary.json')));if(evidence.appVersion===APP_VERSION)browser=evidence;}catch{}
await writeFile(join(out,'HANDOFF.json'),JSON.stringify({appVersion:APP_VERSION,createdAt:new Date().toISOString(),archiveFormat:release.archiveFormat,parserVersion:release.parserVersion,
  runtimeAssets:runtime.length,sourceFiles:source.length,patientDataIncluded:false,syntheticFixturesOutsideRuntime:true,hospitalTestKit:{syntheticOnly:true,...kit,...frozen},browserEvidence:browser,
  validationCommand:'npm run export:hospital (npm test, npm run build, package)',hospitalAcceptance:'Pending actual hospital browser, hosting and storage trial'},null,2)+'\n');
await writeFile(join(out,'READ-ME-FIRST.txt'),`Digitale NPT Archiv ${APP_VERSION}\n\nstatic-application.zip: deploy its contents only to the approved static HTTPS web root. No installation or localhost service on the hospital PC.\nsource-code.zip: matching source and synthetic fixtures for review/development; keep outside every web root. No patient archive is included.\nhospital-test-kit.zip: printable German staff/IT checklist and synthetic exercises/library; keep separate from the web root. Open TESTPLAN.html to begin.
SHA256SUMS.txt: integrity checks for all three ZIP files. HANDOFF.json: versions and available browser evidence.\n\nDevelop on the private Mac first. Occasional hospital trials follow docs/ACCEPTANCE.md in the source ZIP; collect failures and troubleshoot in the Mac project. Folder storage stays separate from all code/build folders. Never merge a patient folder into this handoff.\n`);
await writeFile(join(root,'releases/LATEST.txt'),out+'\n');
console.log(`Handoff ready: ${out}`);
