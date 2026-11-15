import { TEST_GROUPS, MISSING_REASON_SYSTEM } from '../src/source-contract.js';

export function sourceV2(values={},reasons={},statuses={},options={}) {
  const originals={session_uuid:'session_v2',testing_start_date:'15.1.2026',...values};
  const row={...originals,export_schema_version:'2',export_missing_reason_system:MISSING_REASON_SYSTEM,
    ...Object.fromEntries(Object.keys(originals).map(key=>[key+'_missing_reason',reasons[key]??(originals[key]===''?'unknown':'')])),
    ...Object.fromEntries(TEST_GROUPS.map(group=>[group+'_assessment_status',statuses[group]??'unknown']))};
  const entries=Object.entries({...row,...options.override});if(options.reverse)entries.reverse();
  const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
  return (options.bom?'\uFEFF':'')+entries.map(([key])=>key).join(';')+'\r\n'+entries.map(([,value])=>quote(value)).join(';')+'\r\n';
}
