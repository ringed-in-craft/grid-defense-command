/**
 * The threat catalogue for the grid scenario.
 *
 * Every entry is modelled on a real intrusion technique and carries the matching
 * MITRE ATT&CK for ICS technique IDs, so the in-game briefings are checkable
 * rather than hand-wavy. The `brief` text is what the player sees the first time
 * a technique appears, and it doubles as the teaching payload.
 *
 * fields:
 *   name     display name
 *   mitre    ATT&CK for ICS technique IDs this threat exercises
 *   rate     percentage points of dwell accumulated per second on a target
 *   spreads  whether the threat moves laterally to adjacent nodes
 *   targets  node types it will be seeded on, or '*' for anything reachable
 *   brief    the teaching text, with the real-world incident it comes from
 */

export const THREATS = {
  phish: {
    name: 'Spearphishing',
    mitre: ['T0865', 'T0859'],
    rate: 6,
    spreads: true,
    targets: '*',
    brief:
      'Most grid intrusions start with a person clicking something. In Ukraine ' +
      'in 2015, stolen credentials let attackers open breakers by hand and cut ' +
      'power to roughly 225,000 people. Counter: MFA and segmentation. ' +
      '(ATT&CK for ICS: T0865 Spearphishing Attachment, T0859 Valid Accounts)'
  },
  ddos: {
    name: 'Denial of service',
    mitre: ['T0814', 'T0832'],
    rate: 14,
    spreads: false,
    targets: ['soc'],
    brief:
      'A flood takes a service down, but the real damage is that defenders go ' +
      'blind while it is down: every threat then progresses 50% faster and you ' +
      'lose your threat indicators entirely. Counter: rate limiting and ' +
      'redundant paths to the control centre. ' +
      '(ATT&CK for ICS: T0814 Denial of Service, T0832 Manipulation of View)'
  },
  ics: {
    name: 'ICS protocol attack',
    mitre: ['T0836', 'T0855'],
    rate: 9,
    spreads: false,
    targets: ['gen', 'sub'],
    brief:
      'Industroyer-style malware speaks grid protocols directly (IEC 60870-5-104, ' +
      'Modbus) and opens breakers without any operator action. Counter: patching, ' +
      'protocol allow-listing, active hunting. ' +
      '(ATT&CK for ICS: T0836 Modify Parameter, T0855 Unauthorized Command Message)'
  },
  ransom: {
    name: 'Ransomware',
    mitre: ['T1486', 'T0826'],
    rate: 5,
    spreads: true,
    targets: '*',
    brief:
      'Ransomware moves sideways first, then encrypts. Colonial Pipeline in 2021 ' +
      'shut a fuel pipeline down over IT-side ransomware — the OT side was never ' +
      'touched. Counter: segmentation, offline backups, isolate early. ' +
      '(ATT&CK for ICS: T1486 Data Encrypted for Impact, T0826 Loss of Availability)'
  }
};

/** Order in which threats unlock, and the elapsed seconds at which they do. */
export const THREAT_UNLOCKS = [
  { id: 'phish', at: 0 },
  { id: 'ddos', at: 20 },
  { id: 'ics', at: 35 },
  { id: 'ransom', at: 50 }
];
