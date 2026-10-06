/**
 * Resources the player spends.
 *
 * M1 keeps this deliberately minimal: one scalar budget, because that is all
 * any scenario needs so far. It exists as a module rather than inline arithmetic
 * because M5's detection scenario needs a second resource (analyst time) that
 * regenerates on a different curve — that is the seam, not an abstraction
 * invented in advance.
 */

/**
 * Regenerate the run's budget by `dt` seconds, capped.
 * @param {any} run
 * @param {number} dt
 */
export function regenBudget(run, dt) {
  const cfg = run.config.resources.budget;
  run.budget = Math.min(cfg.cap, run.budget + cfg.perSecond * dt);
}

/**
 * @param {any} run
 * @param {number} cost
 * @returns {boolean}
 */
export function canAfford(run, cost) {
  return run.budget >= cost;
}

/**
 * Deduct a cost. Callers must check `canAfford` first — action resolution does.
 * @param {any} run
 * @param {number} cost
 */
export function spend(run, cost) {
  run.budget -= cost;
}
