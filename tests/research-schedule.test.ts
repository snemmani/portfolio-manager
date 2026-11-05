import assert from 'node:assert/strict';
import {researchSlot,researchSchedule} from '../lib/research-schedule';
import {formatIST} from '../lib/time';
const at=(s:string)=>Date.parse(s);
assert.equal(researchSlot(at('2026-11-04T09:14:59+05:30')),null);
assert.equal(researchSlot(at('2026-11-04T09:15:00+05:30')),'2026-11-04T09:15');
assert.equal(researchSlot(at('2026-11-04T15:29:59+05:30')),'2026-11-04T15:15');
assert.equal(researchSlot(at('2026-11-04T15:30:00+05:30')),null);
assert.equal(researchSlot(at('2026-11-07T12:00:00+05:30')),null);
assert.equal(researchSlot(at('2026-11-08T12:00:00+05:30')),null);
assert.equal(researchSlot(at('2026-11-04T03:45:00Z')),'2026-11-04T09:15');
assert.equal(researchSchedule(true,'2026-11-04T09:15',at('2026-11-04T09:20:00+05:30')).nextAutomaticAt,'2026-11-04T05:45:00.000Z');
assert.equal(researchSchedule(true,null,at('2026-11-06T15:30:00+05:30')).nextAutomaticAt,'2026-11-09T03:45:00.000Z');
assert.equal(researchSchedule(false,null,at('2026-11-04T10:00:00+05:30')).nextAutomaticAt,null);
assert.match(formatIST('2026-11-03T20:00:00Z'),/04 Nov 2026/);assert.match(formatIST('2026-11-03T20:00:00Z'),/01:30/);assert.match(formatIST('2026-11-03T20:00:00Z'),/IST$/);
console.log('PASS: IST boundaries, weekdays/weekends, hourly slots, next-run rollover, disabled schedule and fixed-offset display.');

const slots=new Set<string>();for(let minute=0;minute<24*60;minute++){const slot=researchSlot(Date.parse('2026-11-04T00:00:00+05:30')+minute*60000);if(slot)slots.add(slot);}assert.equal(slots.size,4);assert.deepEqual([...slots],['2026-11-04T09:15','2026-11-04T11:15','2026-11-04T13:15','2026-11-04T15:15']);
