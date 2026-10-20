import assert from 'node:assert/strict';
import { primarySiteReportingChain } from '../src/utils/commandReporting.js';
const users=[
{id:'r',email:'robinson@test',rank:'First Sergeant',supervisor_id:'c',profile_photo_url:'photo-r'},
{id:'c',email:'cook@test',rank:'Lieutenant',supervisor_id:'m'},
{id:'m',rank:'Major'},
{id:'l1',rank:'Lt Colonel',supervisor_id:'top'},
{id:'l2',rank:'Lt Colonel',supervisor_id:'top'},
{id:'top',rank:'Colonel'},
];
for(const refs of [['cook@test','robinson@test'],['robinson@test','cook@test']]){
 const chain=primarySiteReportingChain(refs,users);
 assert.equal(chain.levels[0][0].id,'r');
 assert.deepEqual(chain.levels.map(level=>level.map(p=>p.id)),[['r'],['c'],['m'],['l1','l2'],['top']]);
 assert.equal(chain.incomplete,false);
}
assert.equal(primarySiteReportingChain(['old@test'],[{...users[0],email_aliases:['old@test']}]).levels[0][0].id,'r');
assert.equal(primarySiteReportingChain(['cook@test','other@test'],[users[1],{id:'other',email:'other@test'}]).assignmentRequired,true);
assert.equal(primarySiteReportingChain(['missing@test'],users).unresolved,true);
assert.equal(primarySiteReportingChain([],users),null);
const cyclic=[{id:'a',email:'a@test',supervisor_id:'b'},{id:'b',supervisor_id:'a'}];
assert.equal(primarySiteReportingChain(['a@test'],cyclic).levels.length,2);
console.log('PASS: one direct supervisor, full shared command chain, aliases, missing/ambiguous assignments, cycle safety');
