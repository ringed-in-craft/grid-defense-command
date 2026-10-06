/**
 * The graph model: assets and links.
 *
 * Deliberately dumb. The engine knows about nodes, adjacency and traversal;
 * it knows nothing about what a node *is*. Which node types can be attacked or
 * defended is declared by the scenario's config, not hard-coded here.
 */

import { event } from './events.js';

/**
 * Build the node map and adjacency list for a scenario topology.
 *
 * Node shape is intentionally the same as the original prototype so that
 * rendering and scenario data are unchanged by the extraction:
 *   { id, name, type, x, y, weight, online, threat, ...configured state fields }
 *
 * The extra per-node state fields (mitigation counters, effect timers, boolean
 * flags) are declared by config rather than hard-coded, so a scenario can carry
 * whatever state its actions need without the engine changing.
 *
 * @param {Array<{id:string,name:string,type:string,x:number,y:number,weight?:number}>} assets
 * @param {Array<[string,string]>} links
 * @param {{counters?:string[],timers?:string[],flags?:string[]}} [stateConfig]
 * @returns {{nodes: Record<string, any>, adj: Record<string, string[]>}}
 */
export function buildGraph(assets, links, stateConfig = {}) {
  const counters = stateConfig.counters || [];
  const timers = stateConfig.timers || [];
  const flags = stateConfig.flags || [];

  /** @type {Record<string, any>} */
  const nodes = {};
  /** @type {Record<string, string[]>} */
  const adj = {};

  for (const a of assets) {
    const node = {
      id: a.id,
      name: a.name,
      type: a.type,
      x: a.x,
      y: a.y,
      weight: a.weight || 0,
      online: true,
      threat: /** @type {{id:string, progress:number}|null} */ (null)
    };
    for (const field of counters) node[field] = 0;
    for (const field of timers) node[field] = 0;
    for (const field of flags) node[field] = false;
    nodes[a.id] = node;
    adj[a.id] = [];
  }

  for (const [a, b] of links) {
    adj[a].push(b);
    adj[b].push(a);
  }

  return { nodes, adj };
}

/**
 * Whether a node may be targeted by an attack, given the scenario's config.
 * @param {any} node
 * @param {any} config
 */
export function isAttackable(node, config) {
  const blocked = config.state?.unattackableTypes || [];
  return !blocked.includes(node.type);
}

/**
 * Whether a node may be acted on by the defender.
 * @param {any} node
 * @param {any} config
 */
export function isDefendable(node, config) {
  const blocked = config.state?.undefendableTypes || [];
  return !blocked.includes(node.type);
}

/**
 * Emit a cosmetic traffic mark travelling from one node to another.
 * The simulation never reads these; they exist for the renderer.
 * @param {any} run
 * @param {string} from
 * @param {string} to
 */
export function emitTraffic(run, from, to) {
  run.packets.push({ from, to, t: 0 });
}

/**
 * Advance cosmetic traffic marks. Called once per tick by the run loop.
 * @param {any} run
 * @param {number} dt
 */
export function advanceTraffic(run, dt) {
  const speed = run.config.traffic?.speed ?? 1.6;
  run.packets = run.packets.filter((p) => (p.t += dt * speed) < 1);
}

export { event };
