import assert from 'node:assert/strict';
import { affectedRows } from '../lib/queries/affected-rows';

assert.equal(affectedRows({ count: 0 }), 0, 'count 0 → 0');
assert.equal(affectedRows({ count: 3 }), 3, 'count 3 → 3');
// Guards against reverting to node-postgres `.rowCount`, which
// postgres-js never sets:
assert.throws(() => affectedRows({ rowCount: 1 }), /numeric `count`/, 'rowCount must be rejected');
assert.throws(() => affectedRows({}), /numeric `count`/, 'missing count must throw');
console.error('✓ affectedRows reads postgres-js `.count`');
