/**
 * The event contract.
 *
 * `step()` returns events rather than touching the UI. That single rule is what
 * makes the engine testable headlessly and what lets any presentation layer —
 * canvas HUD, event feed, audio cues, a future replay scrubber — consume the
 * same run without the engine knowing any of them exist.
 *
 * `cue` is an optional presentation hint: the scenario decides whether killing a
 * threat should sound like a relief or an alarm, and the engine just carries the
 * label through. It is data, never behaviour — nothing in the simulation reads it.
 */

/**
 * @typedef {object} SimEvent
 * @property {'bad'|'ok'|'learn'} type   severity/intent, drives styling
 * @property {string|null} nodeId        the node this concerns, or null for global
 * @property {string} message            human-readable text
 * @property {string|null} cue           optional audio cue name (presentation only)
 */

/**
 * @param {'bad'|'ok'|'learn'} type
 * @param {string|null} nodeId
 * @param {string} message
 * @param {string|null} [cue]
 * @returns {SimEvent}
 */
export function event(type, nodeId, message, cue = null) {
  return { type, nodeId, message, cue };
}
