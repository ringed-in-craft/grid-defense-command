/**
 * The objective: what "doing well" means, and when the run is over.
 *
 * The engine does not know what the score *is* — the scenario's `flow` returns a
 * number in 0..1 (fraction of load served, fraction of crown jewels clean,
 * fraction of signal retained) and the engine accrues it over time and compares
 * it to a loss threshold.
 */

/**
 * Accrue score for this tick, proportional to how well the objective is being met.
 * @param {any} run
 * @param {number} dt
 */
export function accrueScore(run, dt) {
  run.score += run.service * dt * run.config.objective.scoreRate;
}

/**
 * Whether the run has been lost.
 * @param {any} run
 * @returns {boolean}
 */
export function isLost(run) {
  return run.service < run.config.objective.lossBelow;
}

/**
 * Award a flat bonus (e.g. for neutralising a threat).
 * @param {any} run
 * @param {number} bonus
 */
export function awardBonus(run, bonus) {
  run.score += bonus;
}
