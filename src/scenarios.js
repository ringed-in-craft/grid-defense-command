/**
 * Scenarios describe a grid topology. They are plain data so anyone can author
 * one — a real substation layout, a simplified IEEE test bus, or a made-up mesh
 * — without touching engine code.
 *
 * node: { id, name, type, x, y, weight }
 *   type   'net'  external network (where attacks come from; not defensible)
 *          'soc'  control centre (draws power, does not carry it)
 *          'gen'  generation
 *          'sub'  substation
 *          'load' demand, with a `weight` proportional to criticality
 *   x, y   normalised 0..1 map coordinates
 * link: [a, b]  an undirected electrical/network path
 *
 * The default grid is deliberately meshed: standard n-1 intuition fails here,
 * and that is the lesson.
 */

/** @typedef {{id:string,name:string,type:string,x:number,y:number,weight?:number}} ScenarioNode */
/** @typedef {{id:string,name:string,blurb:string,nodes:ScenarioNode[],links:[string,string][]}} Scenario */

/** @type {Scenario} */
export const HARBOR_REGION = {
  id: 'harbor-region',
  name: 'Harbor region',
  blurb: 'Two generation sites, five substations, a hospital and two cities.',
  nodes: [
    { id: 'INT', name: 'Internet', type: 'net', x: 0.06, y: 0.14 },
    { id: 'SOC', name: 'Control centre', type: 'soc', x: 0.28, y: 0.18 },
    { id: 'P1', name: 'Hydro dam', type: 'gen', x: 0.10, y: 0.62 },
    { id: 'P2', name: 'Gas plant', type: 'gen', x: 0.62, y: 0.10 },
    { id: 'S1', name: 'Substation 1', type: 'sub', x: 0.30, y: 0.52 },
    { id: 'S2', name: 'Substation 2', type: 'sub', x: 0.55, y: 0.42 },
    { id: 'S3', name: 'Substation 3', type: 'sub', x: 0.82, y: 0.28 },
    { id: 'S4', name: 'Substation 4', type: 'sub', x: 0.78, y: 0.72 },
    { id: 'S5', name: 'Substation 5', type: 'sub', x: 0.45, y: 0.82 },
    { id: 'H', name: 'Hospital', type: 'load', x: 0.62, y: 0.68, weight: 3 },
    { id: 'C1', name: 'Harbor city', type: 'load', x: 0.93, y: 0.50, weight: 2 },
    { id: 'C2', name: 'Old town', type: 'load', x: 0.22, y: 0.86, weight: 2 }
  ],
  links: [
    ['INT', 'SOC'], ['SOC', 'S1'], ['SOC', 'S2'], ['SOC', 'P2'],
    ['P1', 'S1'], ['S1', 'S2'], ['S2', 'P2'], ['S2', 'S3'], ['S2', 'H'],
    ['S2', 'S4'], ['S3', 'C1'], ['S4', 'C1'], ['S4', 'H'], ['S5', 'H'],
    ['S5', 'S1'], ['S5', 'C2'], ['P2', 'S3']
  ]
};

/** All shipped scenarios. */
export const SCENARIOS = { 'harbor-region': HARBOR_REGION };

/** @type {Scenario} */
export const DEFAULT_SCENARIO = HARBOR_REGION;
