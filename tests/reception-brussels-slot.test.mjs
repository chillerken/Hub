import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Load the real handler's parser without starting a server or external clients.
const source=readFileSync('ai-receptionist-host/supabase/functions/public-reception-chat/index.ts','utf8');
const match=source.match(/function parseExplicitBelgianSlot\(message:string\)\{[\s\S]*?\n\}/);
assert(match,'Production slot parser must be present');
const js=ts.transpileModule(match[0],{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const parse=runInNewContext(js+'\nparseExplicitBelgianSlot',{Date,Intl});

for(const [message,start] of [
 ['Ik wil een afspraak op 16/01/2030 om 00u30','2030-01-15T23:30:00.000Z'],
 ['Ik wil een afspraak op 16/07/2030 om 01u30','2030-07-15T23:30:00.000Z'],
 ['Ik wil een afspraak op 16.01.2030 om 14u30','2030-01-16T13:30:00.000Z'],
 ['Ik wil een afspraak op 31/03/2030 om 01u30','2030-03-31T00:30:00.000Z'],
 ['Ik wil een afspraak op 31/03/2030 om 03u30','2030-03-31T01:30:00.000Z'],
 ['Ik wil een afspraak op 27/10/2030 om 03u30','2030-10-27T02:30:00.000Z']
])test('Brussels local time: '+message,()=>{
 const result=parse(message);assert(result,'Expected a unique valid time');
 assert.equal(result.start_at,start);assert.equal(result.timezone,'Europe/Brussels');
 assert.equal(new Date(result.end_at)-new Date(result.start_at),3600000);
});
for(const message of [
 'Ik wil een afspraak op 31/03/2030 om 02u30', // DST gap: nonexistent wall time
 'Ik wil een afspraak op 27/10/2030 om 02u30', // DST overlap: ambiguous wall time
 'Ik wil een afspraak op 31/02/2030 om 14u30',
 'Ik wil een afspraak op 16/01/2030 om 24u30',
 'Ik wil een afspraak op 16/01/2030 om 14u99',
 'Ik wil een afspraak op 16/01/2030 om 14:99',
 'Ik wil een afspraak op 16.01.2030',
 'Ik wil een afspraak op 01/01/2020 om 14u30'
])test('invalid, ambiguous or missing time stays unstructured: '+message,()=>assert.equal(parse(message),null));
