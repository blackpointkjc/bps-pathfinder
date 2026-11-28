import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatCadReferenceForSpeech as format} from '../src/utils/cadSpeechReference.js';
test('CAD is never passed to speech as a currency token; IDs retain every digit',()=>{
 assert.equal(format('CAD number 01234.'),'see ay dee number zero one two three four.');
 assert.equal(format('CAD #26-0071.'),'see ay dee number two six dash zero zero seven one.');
 assert.equal(format('CAD B123.'),'see ay dee number B one two three.');
 assert.equal(format('CAD number BPS-202611-0042.'),'see ay dee number zero zero four two.');
 assert.equal(format('Call reference: 001.'),'Call reference zero zero one.');
 assert.equal(format('Pathfinder CAD audio test.'),'Pathfinder see ay dee audio test.');
 assert.equal(format('Priority 2. At 123 Main Street. 10 miles.'),'Priority 2. At 123 Main Street. 10 miles.');
 assert.equal(format(format('CAD number 01234.')),format('CAD number 01234.'));
});
