// Regenerate the scoped resource oracle from the audited 0.7.18 pretty bundle:
// node scripts/optimizer/generate-qi-resource-oracle.cjs <Game.pretty.js>
// A changed native implementation requires a new source audit, not an auto-update.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const assert = require('assert/strict');

const sourcePath = process.argv[2];
assert.ok(sourcePath, 'Supply the audited Game.pretty.js path');
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('\n  WLc = ');
const end = source.indexOf('\n  GLc = ', start);
assert.ok(
  start > 0 && end > start,
  'Audited native function boundaries missing',
);
const expression = source
  .slice(start + '\n  WLc = '.length, end)
  .trim()
  .replace(/,$/, '');
const hash = crypto.createHash('sha256').update(expression).digest('hex');
assert.equal(
  hash,
  '2ebfb80d88796904f40c4236849b65b44c7e09f6b099c4ead693207eda175849',
  'Native WLc changed: audit before regenerating',
);

// Only the hash-verified resource applier executes. UI/logging/event adapters
// are inert or record the delta; no game bootstrap or host APIs enter the VM.
const context = vm.createContext({});
vm.runInContext(
  `
  const sR=()=>0, Z=x=>x, Ap=0;
  let events=[];
  const d2=(name,entity,context,data)=>events.push({name,amount:data.amount,pool:entity.stats.pool});
  const WLc=${expression};
  globalThis.run=(qi,ops,cleanup)=>{
    events=[];
    const entity={stats:{pool:qi},messages:[]};
    for(const op of ops) WLc(op.amount,entity,[],{maxpool:100,qiBoost:op.boost},{poolSpend:0,poolRestore:0},{},{craftingLog:[]});
    return {qi:cleanup?Math.floor(Math.max(0,Math.min(100,entity.stats.pool))):entity.stats.pool,events};
  };
`,
  context,
  { timeout: 1000 },
);

const cases = [];
for (const phase of ['mastery', 'technique', 'buff', 'item'])
  for (const qi of [95, 100])
    for (const boost of [-150, -100, -25, 0, 25])
      for (const a of [-200, -10, 0, 0.5, 5, 20])
        for (const b of [-200, -10, 0, 0.5, 5, 20]) {
          const ops = [a, b].map((amount) => ({ amount, boost }));
          if (phase === 'mastery') ops.push({ amount: -10, boost });
          else if (phase !== 'item') ops.unshift({ amount: -10, boost });
          const expected = context.run(qi, ops, phase !== 'item');
          // Encode halves as integers so native setState scaling rounding does
          // not lose observed fractional resource deltas in the Jest adapter.
          const signature = expected.events.reduce(
            (n, e) =>
              n * 1000 + (e.name === 'poolRestored' ? 200 : 400) + e.amount * 2,
            0,
          );
          cases.push([
            phase,
            qi,
            boost,
            a,
            b,
            expected.qi,
            signature,
            expected.events.at(-1).pool * 2,
          ]);
        }
const fixture = {
  runtime: '0.7.18-97c093b',
  nativeFunction: 'WLc',
  nativeFunctionSha256: hash,
  scope:
    'Isolated native pool applier; explicit mastery/payment/technique/buff/item caller order; fixed cap 100; no full-game bootstrap. Observer values encode twice the amount/pool to retain halves through native scaling rounding.',
  columns: [
    'phase',
    'initialQi',
    'qiBoost',
    'firstAmount',
    'secondAmount',
    'finalQi',
    'eventSignatureTwiceAmounts',
    'lastEventPoolTwice',
  ],
  cases: [],
};
const output =
  JSON.stringify(fixture, null, 2).replace(
    '"cases": []',
    '"cases": [\n' +
      cases.map((row) => '    ' + JSON.stringify(row)).join(',\n') +
      '\n  ]',
  ) + '\n';
fs.writeFileSync(
  path.resolve(__dirname, '../../src/__tests__/fixtures/qiResourceOracle.json'),
  output,
);
console.log(`Wrote ${cases.length} native pool expectations; SHA-256 ${hash}`);
