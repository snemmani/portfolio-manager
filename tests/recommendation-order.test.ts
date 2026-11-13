import assert from 'node:assert/strict';
import {actionPriority,compareRecommendations,actionLabel,discoveryPriority} from '../lib/recommendation-order';
const cards=[{action:'locked',ticker:'ORCL',value:1e9,source:'codex'},{action:'hold',ticker:'HOLD',value:1e8,source:'codex'},{action:'Trim',ticker:'TRIM',value:4000,source:'signal'},{action:'Exit review',ticker:'EXIT',value:10,source:'signal'},{action:'buy',ticker:'BUY',value:8000},{action:'Review',ticker:'REVIEW',value:9000},{action:'watch',ticker:'WATCH',value:99999}];
const sorted=[...cards].sort(compareRecommendations);assert.deepEqual(sorted.map(c=>c.ticker),['EXIT','TRIM','BUY','REVIEW','WATCH','HOLD','ORCL']);assert.equal(cards[0].ticker,'ORCL');
for(const action of ['exit','EXIT','Exit review','sell','SELL'])assert.equal(actionPriority(action),0);
assert.equal(actionPriority('Trim review'),1);assert.equal(actionPriority('Add candidate'),2);assert.equal(actionPriority('Review'),3);assert.equal(actionPriority('unexpected'),3);assert.equal(actionPriority('Locked'),6);
const ties=[{action:'trim',value:null,ticker:'Z',portfolio:'A'},{action:'Trim',value:100,ticker:'B',portfolio:'B'},{action:'Trim',value:100,ticker:'A',portfolio:'B'},{action:'Trim',value:100,ticker:'A',portfolio:'A'},{action:'Trim',value:500,ticker:'C',portfolio:'A'}].sort(compareRecommendations);
assert.deepEqual(ties.map(c=>c.ticker+':'+c.portfolio),['C:A','A:A','A:B','B:B','Z:A']);
const reversed=[...cards].reverse().sort(compareRecommendations);assert.deepEqual(reversed,sorted,'Ordering remains deterministic when feed order changes');
assert.equal(actionLabel('exit'),'Exit');assert.equal(actionLabel('add'),'Checking next step…');
assert.equal(discoveryPriority({status:'eligible'},'enter'),0);assert.equal(discoveryPriority({status:'eligible'}),0);assert.equal(discoveryPriority({status:'watchlist'},'enter'),1);assert.equal(discoveryPriority({status:'eligible'},'watch'),0);assert.equal(discoveryPriority({status:'rejected'},'enter'),2);
console.log('PASS: urgent exits across sources, review variants, deterministic value/symbol/portfolio ties, locked last, immutable input and discovery approval order.');

assert.deepEqual([{action:'Trim review',ticker:'REVIEW',value:1e9},{action:'Trim',ticker:'CAP',value:100}].sort(compareRecommendations).map(c=>c.ticker),['CAP','REVIEW'],'A large review-only holding cannot bury a supported concentration trim');
