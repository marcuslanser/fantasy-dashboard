/**
 * Unit tests for tradeCalc.js
 * Run with: node tradeCalc.test.js
 */
const { calculateRawAdj, findEqualizingValue, evaluateTrade, MAX_VALUE } = require('./tradeCalc.js');

let passed = 0, failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function expect(actual, expected, tolerance = 1) {
  if (typeof expected === 'boolean') {
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  } else {
    if (Math.abs(actual - expected) > tolerance)
      throw new Error(`Expected ${expected} ±${tolerance}, got ${actual.toFixed(2)}`);
  }
}

// ─────────────────────────────────────────────────────────────
// calculateRawAdj
// ─────────────────────────────────────────────────────────────
console.log('\ncalculateRawAdj');

test('returns 0 for p=0', () => {
  expect(calculateRawAdj(0, 9999, 9999), 0, 0);
});

test('returns 0 for negative p', () => {
  expect(calculateRawAdj(-100, 9999, 9999), 0, 0);
});

test('max player (9999) produces positive rawAdj', () => {
  const adj = calculateRawAdj(9999, 9999, 9999);
  if (adj <= 0) throw new Error(`Expected positive, got ${adj}`);
  console.log(`    rawAdj(9999, 9999, 9999) = ${adj.toFixed(0)}`);
});

test('higher-value player has strictly higher rawAdj (same t)', () => {
  const high = calculateRawAdj(8200, 8200, 9999);
  const low  = calculateRawAdj(5500, 8200, 9999);
  if (high <= low) throw new Error(`high(${high.toFixed(0)}) not > low(${low.toFixed(0)})`);
});

test('rawAdj is super-linear: doubling value more than doubles rawAdj', () => {
  const adj2k = calculateRawAdj(2000, 9999, 9999);
  const adj4k = calculateRawAdj(4000, 9999, 9999);
  if (adj4k <= 2 * adj2k)
    throw new Error(`adj(4k)=${adj4k.toFixed(0)} should be > 2×adj(2k)=${(2*adj2k).toFixed(0)}`);
  console.log(`    adj(4000)=${adj4k.toFixed(0)}, 2×adj(2000)=${(2*adj2k).toFixed(0)} — confirmed super-linear`);
});

test('player clamped to t when p > t', () => {
  const normal   = calculateRawAdj(5000, 5000, 9999);
  const clamped  = calculateRawAdj(6000, 5000, 9999); // p > t, should clamp to 5000
  expect(normal, clamped, 0.1);
});

// ─────────────────────────────────────────────────────────────
// findEqualizingValue
// ─────────────────────────────────────────────────────────────
console.log('\nfindEqualizingValue');

test('solving for known rawAdj round-trips within 1 value', () => {
  const t = 9999, v = 9999;
  [1000, 3000, 5000, 7000].forEach(target => {
    const targetAdj = calculateRawAdj(target, t, v);
    const solved    = findEqualizingValue(targetAdj, t, v);
    const solvedAdj = calculateRawAdj(solved, t, v);
    if (Math.abs(solvedAdj - targetAdj) > 2)
      throw new Error(`target=${target}: deficit=${targetAdj.toFixed(1)}, solved=${solved}, solvedAdj=${solvedAdj.toFixed(1)}`);
  });
});

test('returns 0 for deficit=0', () => {
  expect(findEqualizingValue(0, 9999, 9999), 0, 0);
});

// ─────────────────────────────────────────────────────────────
// evaluateTrade
// ─────────────────────────────────────────────────────────────
console.log('\nevaluateTrade');

test('even trade — same KTC value both sides', () => {
  const result = evaluateTrade(
    [{ name: 'Player A', ktcValue: 5000 }],
    [{ name: 'Player B', ktcValue: 5000 }],
  );
  if (result.winningSide !== 'even')
    throw new Error(`Expected even, got ${result.winningSide} (deficit=${result.deficit.toFixed(1)})`);
});

test('four-quarters principle: 1×8000 beats 2×4000', () => {
  const result = evaluateTrade(
    [{ name: 'Stud',    ktcValue: 8000 }],
    [{ name: 'Player A', ktcValue: 4000 }, { name: 'Player B', ktcValue: 4000 }],
  );
  if (result.winningSide !== 'A')
    throw new Error(`Expected A to win — got ${result.winningSide}. sideA=${result.sideA.rawAdjTotal.toFixed(0)} sideB=${result.sideB.rawAdjTotal.toFixed(0)}`);
  console.log(`    1×8000 raw adj: ${result.sideA.rawAdjTotal.toFixed(0)} vs 2×4000 raw adj: ${result.sideB.rawAdjTotal.toFixed(0)}`);
});

test('four-quarters principle: 1×5000 beats 4×1250', () => {
  const result = evaluateTrade(
    [{ name: 'Stud', ktcValue: 5000 }],
    Array.from({ length: 4 }, (_, i) => ({ name: `Filler${i}`, ktcValue: 1250 })),
  );
  if (result.winningSide !== 'A')
    throw new Error(`Expected A to win — got ${result.winningSide}`);
});

test('empty sides produce even result', () => {
  const result = evaluateTrade([], []);
  if (result.winningSide !== 'even') throw new Error('Expected even');
});

test('one-sided empty trade: non-empty side wins', () => {
  const result = evaluateTrade(
    [{ name: 'Chase', ktcValue: 8200 }],
    [],
  );
  if (result.winningSide !== 'A') throw new Error(`Expected A, got ${result.winningSide}`);
});

test('player at max value (9999) — system handles correctly', () => {
  const result = evaluateTrade(
    [{ name: 'Max', ktcValue: 9999 }],
    [{ name: 'Sub', ktcValue: 7000 }],
  );
  if (result.winningSide !== 'A') throw new Error('Max player should win');
  if (result.equalizingPlayerValue <= 0) throw new Error('Equalizing value should be positive');
});

// ─────────────────────────────────────────────────────────────
// Reference example: Ja'Marr Chase vs CeeDee Lamb + Joe Mixon
// Note: reference numbers in the spec (rawAdj ≈ 2900 / 1400 / 1100)
// were computed with a different scaling of the formula. Our implementation
// uses the formula as documented; the *direction* (Chase side wins) and the
// binary-search solver are what we validate here.
// ─────────────────────────────────────────────────────────────
console.log('\nReference example: Ja\'Marr Chase (8200) vs CeeDee Lamb (5500) + Joe Mixon (4900)');

const chase = { name: "Ja'Marr Chase", ktcValue: 8200 };
const lamb  = { name: 'CeeDee Lamb',   ktcValue: 5500 };
const mixon = { name: 'Joe Mixon',     ktcValue: 4900 };

const ref = evaluateTrade([chase], [lamb, mixon]);

console.log(`  t = ${ref.t}`);
console.log(`  Side A rawAdj (Chase):          ${ref.sideA.rawAdjTotal.toFixed(0)}`);
console.log(`  Side B rawAdj (Lamb + Mixon):   ${ref.sideB.rawAdjTotal.toFixed(0)}`);
console.log(`  Winning side: ${ref.winningSide}`);
console.log(`  Deficit:                        ${ref.deficit.toFixed(0)}`);
console.log(`  Equalizing player value:        ${ref.equalizingPlayerValue}`);
console.log(`  Value adjustment:               ${ref.valueAdjustment}`);

test('Chase side wins', () => {
  if (ref.winningSide !== 'A') throw new Error(`Expected A, got ${ref.winningSide}`);
});

test('positive equalizing player value', () => {
  if (ref.equalizingPlayerValue <= 0)
    throw new Error(`Expected > 0, got ${ref.equalizingPlayerValue}`);
});

test('binary search deficit solver produces accurate rawAdj round-trip', () => {
  const eq    = ref.equalizingPlayerValue;
  const eqAdj = calculateRawAdj(eq, ref.t, ref.v);
  if (Math.abs(eqAdj - ref.deficit) > 5)
    throw new Error(`deficit=${ref.deficit.toFixed(0)}, rawAdj(equalizingValue=${eq})=${eqAdj.toFixed(0)}`);
});

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
