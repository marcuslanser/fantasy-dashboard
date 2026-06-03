/**
 * KTC-style trade value adjustment calculator.
 *
 * Implements the raw-adjustment algorithm reverse-engineered from KTC /
 * documented at javelinfantasyfootball.com.
 *
 * Core principle: lower-value players are exponentially discounted so that
 * a bundle of four mediocre players never equates to one elite player —
 * even when raw KTC totals match ("four quarters ≠ a dollar").
 *
 * UMD wrapper: works as a CommonJS module (Node/tests) and as a browser
 * global (window.TradeCalc).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TradeCalc = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /** Maximum possible KTC player value — treated as the league ceiling. */
  const MAX_VALUE = 9999;

  /**
   * Calculates the hidden "raw adjustment" value for a single player.
   *
   * The formula applies four weighted sub-terms that together create an
   * exponential curve:
   *
   *   rawAdj(p, t, v) = p × (
   *     0.10  +
   *     0.23 × (p / v)^8       — heavily discounts players far below overall max
   *     0.37 × (p / t)^1.3     — discounts players relative to the best in this trade
   *     0.20 × (p / (v+2000))^1.28  — smoothing term against a raised ceiling
   *   )
   *
   * Key properties:
   *  - A player at max value (9999) yields ~41% of that in raw adj.
   *  - A player at 50% of max yields only ~26% of the max player's raw adj.
   *  - The relationship is strictly super-linear: doubling player value more
   *    than doubles raw adj, so bulk always loses to quality.
   *
   * @param {number} p - This player's KTC value (0 … v).
   * @param {number} t - KTC value of the most valuable player IN the trade.
   * @param {number} v - KTC value of the most valuable player OVERALL (constant MAX_VALUE).
   * @returns {number} Raw adjustment value (≥ 0).
   */
  function calculateRawAdj(p, t, v) {
    if (p <= 0 || t <= 0 || v <= 0) return 0;
    const pc = Math.min(p, t, v); // clamp: player can't exceed the trade or overall max
    return pc * (
      0.10 +
      0.23 * Math.pow(pc / v,           8.00) +
      0.37 * Math.pow(pc / t,           1.30) +
      0.20 * Math.pow(pc / (v + 2000),  1.28)
    );
  }

  /**
   * Binary-searches for the KTC value X such that rawAdj(X, t, v) ≈ targetRawAdj.
   *
   * This answers the question "add a player worth X to even the trade."
   *
   * @param {number} targetRawAdj - The raw-adjustment deficit to solve for.
   * @param {number} t            - Max player KTC value in the current trade.
   * @param {number} v            - Overall max (MAX_VALUE).
   * @returns {number} Rounded integer KTC value that produces targetRawAdj.
   */
  function findEqualizingValue(targetRawAdj, t, v) {
    if (targetRawAdj <= 0) return 0;

    // Quick bound check: even the max player may not cover a deficit if the
    // trade contains a player above the computed max (shouldn't happen, but safe).
    const ceiling = Math.max(t, v);
    if (calculateRawAdj(ceiling, t, v) < targetRawAdj) return ceiling;

    let lo = 0, hi = ceiling, guess = 0;
    for (let i = 0; i < 64; i++) {
      guess = (lo + hi) / 2;
      const adj = calculateRawAdj(guess, t, v);
      if (Math.abs(adj - targetRawAdj) < 0.5) break;
      if (adj < targetRawAdj) lo = guess;
      else hi = guess;
    }
    return Math.round(guess);
  }

  /**
   * Evaluates a trade between two sides using KTC-style raw adjustments.
   *
   * Steps:
   *  1. t = max KTC value across ALL players on both sides.
   *  2. Compute rawAdj for every player.
   *  3. Sum raw adjustments per side.
   *  4. Identify the losing side and the raw-adjustment deficit.
   *  5. Binary-search for the equalizing player value.
   *  6. Compute the visible value adjustment shown in the UI.
   *
   * @param {Array<{name: string, ktcValue: number}>} sideA
   * @param {Array<{name: string, ktcValue: number}>} sideB
   * @returns {{
   *   sideA: { players: Array, rawAdjTotal: number, ktcTotal: number },
   *   sideB: { players: Array, rawAdjTotal: number, ktcTotal: number },
   *   winningSide: 'A' | 'B' | 'even',
   *   equalizingPlayerValue: number,
   *   valueAdjustment: number,
   *   deficit: number,
   *   t: number,
   *   v: number
   * }}
   */
  function evaluateTrade(sideA, sideB) {
    const v = MAX_VALUE;
    const all = [...sideA, ...sideB];
    if (all.length === 0) {
      return {
        sideA: { players: [], rawAdjTotal: 0, ktcTotal: 0 },
        sideB: { players: [], rawAdjTotal: 0, ktcTotal: 0 },
        winningSide: 'even', equalizingPlayerValue: 0,
        valueAdjustment: 0, deficit: 0, t: 0, v,
      };
    }

    // Step 1
    const t = all.reduce((mx, p) => Math.max(mx, p.ktcValue), 0);

    // Steps 2 & 3
    function annotateSide(side) {
      const players = side.map(p => ({
        ...p,
        rawAdj: calculateRawAdj(p.ktcValue, t, v),
      }));
      const rawAdjTotal = players.reduce((s, p) => s + p.rawAdj, 0);
      const ktcTotal    = players.reduce((s, p) => s + p.ktcValue, 0);
      return { players, rawAdjTotal, ktcTotal };
    }

    const resA = annotateSide(sideA);
    const resB = annotateSide(sideB);

    // Step 4
    const deficit = Math.abs(resA.rawAdjTotal - resB.rawAdjTotal);
    const winningSide = resA.rawAdjTotal > resB.rawAdjTotal + 0.5 ? 'A'
                      : resB.rawAdjTotal > resA.rawAdjTotal + 0.5 ? 'B'
                      : 'even';

    // Step 5
    const equalizingPlayerValue = findEqualizingValue(deficit, t, v);

    // Step 6 — value adjustment: what is the KTC gap after adding the equalizer?
    let valueAdjustment = 0;
    if (winningSide === 'A') {
      // Side B is losing; add equalizingPlayerValue to B's KTC total
      valueAdjustment = (resB.ktcTotal + equalizingPlayerValue) - resA.ktcTotal;
    } else if (winningSide === 'B') {
      valueAdjustment = (resA.ktcTotal + equalizingPlayerValue) - resB.ktcTotal;
    }

    return {
      sideA: resA,
      sideB: resB,
      winningSide,
      equalizingPlayerValue,
      valueAdjustment,
      deficit,
      t, v,
    };
  }

  return { calculateRawAdj, findEqualizingValue, evaluateTrade, MAX_VALUE };

}));
