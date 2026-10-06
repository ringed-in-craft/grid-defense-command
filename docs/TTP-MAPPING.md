# MITRE ATT&CK for ICS mapping

Every threat in the game maps to techniques from
[MITRE ATT&CK for ICS](https://attack.mitre.org/matrices/ics/), so the briefings are
checkable rather than vibes. This file is the reference behind the in-game `learn`
feed messages.

The technique IDs live in `src/threats.js` alongside the `brief` text that the game
shows, so the game cannot drift out of sync with this document without a test visible in
the diff.

---

## Threat → technique table

| Game threat | Techniques | Tactic | What it models | Public reference |
|-------------|-----------|--------|----------------|------------------|
| **Spearphishing** | `T0865` Spearphishing Attachment | Initial Access | A user is induced into executing a malicious attachment, yielding a foothold from which the adversary moves laterally | Ukraine 2015 — stolen credentials from phishing let operators' own HMI sessions open breakers |
| | `T0859` Valid Accounts | Initial Access / Persistence / Lateral Movement | Stolen credentials used directly, so the activity looks like normal operator behaviour | Same incident — attackers used legitimate remote access |
| **Denial of service** | `T0814` Denial of Service | Inhibit Response Function | Flooding a service until it fails, degrading the defender's ability to respond | Used against utility and ICS-facing infrastructure in multiple campaigns |
| | `T0832` Manipulation of View | Impair Process Control | Degrading or blocking the operator's *view* of the process — the operator loses situational awareness without necessarily losing control | In-game: the control centre going dark hides threat indicators and accelerates everything |
| **ICS protocol attack** | `T0836` Modify Parameter | Impair Process Control | Altering setpoints or relay parameters so protection operates outside its intended envelope | Industroyer / Industryer, 2016 — Ukraine; speaks IEC 60870-5-101 and 104, IEC 61850 and OPC DA directly to field devices |
| | `T0855` Unauthorized Command Message | Impair Process Control | Sending valid-looking control commands on the process protocol, with no operator in the loop | Industroyer opened breakers directly; Triton targeted safety instrumented systems |
| **Ransomware** | `T1486` Data Encrypted for Impact | Impact | Encrypting data for extortion, with operational downtime as the real consequence | Colonial Pipeline 2021 — a shutdown over IT-side ransomware; OT was never touched |
| | `T0826` Loss of Availability | Impact | The availability outcome: equipment or data cannot be used | Conti-linked actors against multiple critical-infrastructure operators |

---

## What the game deliberately gets right

Three modelling choices exist specifically because they are the actual lesson from those
incidents, not because they are fun mechanics:

1. **Lateral movement is a graph problem, not a difficulty slider.** Spearphishing and
   ransomware spread along edges. The counter is segmentation (`T0859`/`T1486` are both
   contained by it in reality), which is why "Segment" exists as a distinct action from
   "Isolate" — it blocks movement *without* taking the node off the grid.

2. **Losing view is worse than losing control.** Ukraine 2015 ended with operators
   driving breakers manually because their remote control was gone. The game models the
   same shape: a DDoS on the control centre does not merely take a node offline, it
   removes your ability to see the board while making everything on it faster (`T0832`).

3. **IT-side compromise reaches OT-side consequences.** Colonial Pipeline is the clearest
   public example, and it is why ransomware in the game targets ordinary nodes and is
   contained by the same segmentation that stops an intrusion.

---

## What is not modelled

Stated plainly, because a mapping table invites overreach:

- **No manipulation of process beyond availability.** `T0831` Manipulation of Control and
  sensor-level view manipulation (`T0832`) are represented only narratively — the engine
  has no sensor telemetry to falsify, so it cannot model an operator being shown a
  plausible-but-wrong picture of the plant.
- **No supply chain (`T0862`).** Real campaigns have leveraged vendor access; the game
  has no third-party trust relationship to abuse.
- **No safety-system targeting.** Triton's actual contribution was going after the SIS —
  the layer whose job is to prevent physical damage. Modelling that honestly would
  require a physical-process layer (pressure, temperature, trip logic) that this engine
  does not have.
- **No persistence, C2, or exfiltration phases.** The game starts at privilege and stops
  at impact. `T0832`-style view manipulation is the only "lying to the operator" element
  present.

If you extend the threat catalogue, add the technique IDs and a `brief` in
`src/threats.js`, then add a row here. Keep both in the same commit.
