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
test('legacy punctuation, reversed currency-like ordering and comma-separated references are safe',()=>{
 for(const value of ['CAD #16025','C.A.D. #16025','C A D number 16025','16025 CAD','CAD: 16,025','CAD no. 16025'])assert.equal(format(value),'see ay dee number one six zero two five',value);
 assert.equal(format('Unit 150. CAD #00125. 3200 North Rabza Blvd.'),'Unit 150. see ay dee number zero zero one two five. 3200 North Rabza Blvd.');
 assert.equal(format('CAD #R-12345.'),'see ay dee number R dash one two three four five.');
});
