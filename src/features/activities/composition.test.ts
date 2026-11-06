import assert from 'node:assert/strict';
import {test} from 'node:test';
import {energyComposition} from './energy-composition';
test('消耗占比不把未知或总数记录伪造为分项，明确活动0合法',()=>{
 assert.equal(energyComposition('2058',null),null);assert.equal(energyComposition(null,null),null);assert.equal(energyComposition('0','0'),null);
 assert.deepEqual(energyComposition('2058','0'),{resting:1,active:0});
 const shares=energyComposition('2000','500');assert.equal(shares?.resting,.8);assert.equal(shares?.active,.2);
});
