/**
 * The event contract.
 *
 * `step()` returns events rather than touching the UI. That single rule is what
 * makes the engine testable headlessly and what lets any presentation layer —
 * canvas HUD, event feed, audio cues, a future replay scrubber — consume the
 * same run without the engine knowing any of them exist.
 */

/**
 * @typedef {object} SimEvent
 * @property {'bad'|'ok'|'learn'} type   severity/intent, drives styling and sound
 * @property {string|null} nodeId        the node this concerns, or null for global
 * @property {string} message            human-readable text
 */

/**
 * @param {'bad'|'ok'|'learn'} type
 * @param {string|null} nodeId
 * @param {string} message
 * @returns {SimEvent}
 */
export function event(type, nodeId, message) {
  return { type, nodeId, message };
}
