// Between-sector upgrades: the player picks 1 of 3. `apply(stats, game)`
// mutates the persistent ship stats (entities/ship.js createShipStats).
export const UPGRADES = [
  { id: 'twinShot', name: 'Twin Shot', desc: 'Adds a pair of angled barrels', max: 2, apply: (s) => { s.spread += 1; } },
  { id: 'coolant', name: 'Coolant Loop', desc: 'Shots make 25% less heat', max: 3, apply: (s) => { s.heatMul *= 0.75; } },
  { id: 'heatsink', name: 'Heat Sink', desc: 'Cannon cools 40% faster', max: 3, apply: (s) => { s.coolMul *= 1.4; } },
  { id: 'capacitor', name: 'Shield Capacitor', desc: '+40 maximum shield energy', max: 3, apply: (s) => { s.shieldMax += 40; } },
  { id: 'regen', name: 'Field Regenerator', desc: 'Shield recharges 50% faster', max: 3, apply: (s) => { s.shieldRegenMul *= 1.5; } },
  { id: 'piercing', name: 'Piercing Rounds', desc: 'Shots pass through one more target', max: 2, apply: (s) => { s.pierce += 1; } },
  { id: 'jumpDrive', name: 'Jump Drive', desc: 'Hyperspace recharges 40% faster and never misjumps', max: 1, apply: (s) => { s.jumpCooldownMul *= 0.6; s.safeJump = true; } },
  { id: 'thrusters', name: 'Afterburners', desc: '+20% thrust and top speed', max: 2, apply: (s) => { s.thrustMul *= 1.2; } },
  { id: 'magnet', name: 'Tractor Beam', desc: 'Draws pickups in from further away', max: 2, apply: (s) => { s.magnet += 140; } },
  { id: 'rail', name: 'Rail Accelerator', desc: '+25% missile speed and range', max: 2, apply: (s) => { s.missileSpeedMul *= 1.25; } },
  { id: 'hull', name: 'Spare Hull', desc: '+1 ship', max: 3, apply: (_s, game) => { game.lives += 1; } },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
