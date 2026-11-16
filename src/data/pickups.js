// Pickups dropped by crystals, saucers and (rarely) small asteroids.
// Timed buffs last PICKUP.buffSeconds.
export const PICKUPS = {
  spread: { weight: 3, label: 'SPREAD', color: '#ffae3b', timed: true },
  rapid: { weight: 3, label: 'RAPID', color: '#ffe14d', timed: true }, // no heat, faster fire
  pierce: { weight: 2, label: 'PIERCE', color: '#c77dff', timed: true },
  shield: { weight: 3, label: 'SHIELD', color: '#5ad8ff', timed: false }, // refill energy
  life: { weight: 0.6, label: '+1 SHIP', color: '#6dff8a', timed: false },
};
