/**
 * Power flow for the grid scenario — the scenario's `flow` solver.
 *
 * This is one of the two functions that make the engine general: it computes
 * which assets are energised and returns a service ratio in 0..1. A ransomware
 * scenario would supply reachability-from-infection instead; the tick loop,
 * threat engine and action resolution are all shared.
 *
 * Rules (unchanged from the prototype):
 *   - generators energise their neighbours
 *   - substations relay
 *   - loads are sinks and do not relay onward
 *   - the external network never carries power
 *   - the control centre DRAWS power but is not a conduit
 *
 * That last rule is physically correct (you do not route supply through a
 * control room to reach a city) and it gives the operator a consequence for
 * losing it: no feed means blind, which means faster threats and no visibility.
 */

/**
 * @param {any} run
 * @returns {number} fraction of critical load served, 0..1
 */
export function powerFlow(run) {
  const nodes = run.nodes;
  for (const id in nodes) nodes[id].powered = false;

  /** @type {string[]} */
  const queue = [];
  for (const id in nodes) {
    if (nodes[id].type === 'gen' && nodes[id].online) {
      nodes[id].powered = true;
      queue.push(id);
    }
  }

  while (queue.length) {
    const cur = queue.pop();
    for (const nid of run.adj[cur]) {
      const o = nodes[nid];
      if (o.powered || !o.online) continue;
      if (o.type === 'net' || o.type === 'soc') continue;
      o.powered = true;
      if (o.type !== 'load') queue.push(nid);
    }
  }

  // The control centre is powered if it has any live feed at all.
  for (const id in nodes) {
    const n = nodes[id];
    if (n.type !== 'soc') continue;
    n.powered = n.online && run.adj[id].some((nid) => nodes[nid].powered);
  }

  let served = 0;
  let total = 0;
  for (const id in nodes) {
    const n = nodes[id];
    if (n.type !== 'load') continue;
    total += n.weight;
    if (n.powered && n.online) served += n.weight;
  }
  return total ? served / total : 0;
}

/**
 * The scenario's `senses` solver: is the operator flying blind?
 *
 * Truthful only while the control centre has power and is online. When blind,
 * threats run faster AND the renderer stops reporting where they are — which is
 * the actual point of a denial-of-service against a control centre (T0832).
 *
 * @param {any} run
 * @returns {boolean}
 */
export function isBlind(run) {
  for (const id in run.nodes) {
    const n = run.nodes[id];
    if (n.type === 'soc') return !n.online || !n.powered;
  }
  return false;
}
