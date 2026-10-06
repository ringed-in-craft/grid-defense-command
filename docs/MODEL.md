# Simulation model

This document describes what the simulation actually computes. The goal is that you can
read it, read `src/engine/`, and find that they agree.

## Scope: which layer this describes

The code is split into two layers (see the README's Architecture section):

- **`src/engine/`** — scenario-agnostic machinery: the graph, the threat dwell and
  spread model, costed action resolution, resources, the objective, and the tick loop.
  Sections 1–6 below describe this layer, and every statement in them is true of *any*
  scenario.
- **`src/scenario/grid/`** — this game specifically: the Harbor region topology, the
  threat catalogue carrying its ATT&CK for ICS mappings, the six defensive actions, and
  the two solver functions (`flow` and `senses`). Where this document names substations
  or power, it is describing the grid scenario's *plug-in*; the engine does not contain
  those names anywhere in its code.

`src/sim.js` is the public facade over both, and its API is unchanged from before the
split.

Everything below is deterministic given a seed: all randomness comes from a single
`mulberry32` generator created in `createRun(pack, seed)`, and every call site
draws from it in a fixed order.

---

## 1. Entities

| Entity | Meaning |
|--------|---------|
| **Node** | A site: `net` (external network), `soc` (control centre), `gen` (generation), `sub` (substation), or `load` (demand, with a criticality `weight`) |
| **Link** | An undirected connection. Carries power and is the only channel for lateral movement |
| **Threat** | A seeded intrusion on one node, with a dwell `progress` in 0–100 |
| **Action** | A defender capability applied to one node, costing Response Budget |

Node state: `online`, `hardening` (0–3), `firewall` (seconds remaining),
`isolation` (seconds remaining), `segmented` (bool), `powered` (derived), `threat`.

---

## 2. Power flow

Recomputed from scratch every tick by `powerFlow(state)`. Order matters and is fixed:

1. Clear `powered` on every node.
2. Seed the queue with every **online `gen`** node, marked `powered`.
3. Breadth-first walk: for each neighbour of a queued node, if it is **offline**, or
   already powered, or of type `net`/`soc`, skip it. Otherwise mark it powered — and
   **only enqueue it if it is not a `load`**.
4. Separately: a `soc` node is powered iff it is online **and** at least one neighbour
   is powered.

Two consequences worth stating explicitly, because both are load-bearing:

- **Loads are sinks.** They receive power and pass none onward. A city does not feed
  a substation.
- **The control centre is powered but is not a conduit.** It is deliberately excluded
  from the walk. This is physically right (you do not route supply through a control
  room to reach a city) and it gives the operator a consequence for losing it: no feed
  means `isBlind()`, which means the 1.5× threat-acceleration penalty and hidden threat
  indicators.

Service ratio is `Σ weight(powered ∧ online loads) / Σ weight(all loads)`. On the
shipped scenario total load weight is 7 (hospital 3, two cities of 2 each).

### Why n-1 fails here

The default topology is a mesh, not a tree. Losing Substation 2 alone still serves
100% of load, because four independent paths reroute around it. Only when a generation
site *and* a bridging substation are down does the ratio collapse — and it collapses
to exactly 2/7, which the test suite asserts. This is the single most important thing
the game teaches: **topology decides resilience, not node criticality.**

---

## 3. Threat model

Each threat in `src/threats.js` has `rate` (dwell points per second), `spreads`,
`targets`, and a MITRE ATT&CK for ICS mapping.

**Dwell.** Per node per tick:

```
rate = spec.rate × (1 − 0.25 × hardening) × (blind ? 1.5 : 1)
if firewall > 0: rate = 0
progress += rate × dt
```

Reaching `progress ≥ 100` takes the node offline and clears the threat.

**Lateral movement.** While a threat is spreading, has `progress > 25`, and the source
is neither segmented nor rate-limited, it infects a uniformly random *eligible*
neighbour with probability `dt × 0.25` per tick. Eligible means: not `net`, online, no
existing threat, no firewall, not segmented.

**Seeding.** Choice of threat type is uniform over those unlocked by elapsed time
(`phish` at 0s, `ddos` at 20s, `ics` at 35s, `ransom` at 50s). Target node is drawn
uniformly from nodes that are online, threat-free, not `net`, and of a type the threat
accepts. A node at hardening 3 has a 40% chance of shrugging off an incoming seed.

**Blindness.** While the control centre is unpowered or offline, all dwell rates are
multiplied by 1.5 **and** `render.js` suppresses threat indicators, showing only that
*something* is wrong. This is `T0832 Manipulation of View`: the interesting failure mode
of a DDoS against a control centre is not downtime, it is lost visibility.

---

## 4. Action resolution

Budget starts at 100, regenerates at 4/s, and caps at 150. Actions are rejected (never
partial) when unaffordable or inapplicable.

| Action | Guards | Effect |
|--------|--------|--------|
| Harden | online, `hardening < 3`, budget ≥ 20 | `hardening += 1` |
| Rate-limit | online, budget ≥ 15 | `firewall = 12` |
| Hunt | online, has a threat, budget ≥ 20 | clear threat, `+50` score, `kills += 1` |
| Segment | online, not already segmented, budget ≥ 10 | `segmented = true` |
| Isolate | online (free) | `online = false`, `isolation = 10`, clear threat |
| Restore | offline, budget ≥ 30 | `online = true`, clear threat |

Isolate is free and purges any threat instantly. It is also the only action that removes
a node from the power graph. On a hub, that is catastrophic — which is what makes the
free price a trap rather than a dominant move.

An isolated node returns online automatically when `isolation` reaches 0.

---

## 5. Scoring and loss

- Score accrues as `service × dt × 2`, plus 50 per successful hunt.
- The run is lost when service falls below **0.2** (four fifths of load dark).

Score is therefore "how long and how completely you kept the lights on", not a win
condition. The spawn interval tightens as `max(2, 7 − t/22)` seconds, scaled by a random
0.8–1.2, and a second spawn is rolled with 40% probability after 70s. No policy survives
indefinitely; the run always ends, and the score is the measure.

---

## 6. Determinism

`createState(scenario, seed)` builds the RNG. There is no `Date.now()`, no
`Math.random()`, and no DOM access anywhere in `sim.js`. Consequences:

- A run is fully reproducible from its seed (`index.html#seed=1234`, and the loss
  screen hands you the link).
- The engine runs headlessly in `node:test`, which is how the electrical invariants and
  the difficulty guarantees are asserted.
- `test/engine.test.js` asserts that the same seed produces a byte-identical run
  signature, and that different seeds do not.

The one deliberate exception is cosmetic: `state.packets` (the little dashes flying along
links) is advanced in `step` but never read by any simulation logic. It is presentation,
and it is marked as such in the source.

---

## 7. What the model does not do

Honest limits, so nobody mistakes this for a power-systems simulator:

- **No AC power flow.** This is connectivity, not load flow. No voltages, frequencies,
  reactive power, or line limits. A real analysis uses Newton–Raphson or a DC
  approximation.
- **No protocol realism.** Threats are abstracted to a dwell rate. Nothing implements
  IEC 60870-5-104 or Modbus, and nothing talks to hardware.
- **No attacker adaptation.** Threats seed and spread stochastically but do not observe
  your defences and adapt. An adaptive adversary is the obvious next extension.
- **Instant switching.** Isolation and restore are instantaneous, with no breaker timing
  or restoration transients (a real grid is genuinely hard to blackstart).
