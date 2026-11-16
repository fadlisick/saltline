// The buy menu's numbers: what each item costs, what the player can afford, and
// the round rewards. main.js owns the money; this module owns the catalogue.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

export const SHOP = [
  { id: 'smg', name: WEAPONS.smg.name, price: WEAPONS.smg.price, note: '32-round auto, close to mid' },
  { id: 'rifle', name: WEAPONS.rifle.name, price: WEAPONS.rifle.price, note: '30-round auto rifle' },
  { id: 'shotgun', name: WEAPONS.shotgun.name, price: WEAPONS.shotgun.price, note: '8-pellet close quarters' },
  { id: 'dmr', name: WEAPONS.dmr.name, price: WEAPONS.dmr.price, note: 'High damage, slow, precise — hold right mouse to scope' },
  { id: 'grenade', name: GRENADE.name, price: GRENADE.price, note: 'Frag, 6 m blast' },
  { id: 'armor', name: ARMOR.name, price: ARMOR.price, note: 'Absorbs half of each hit' },
];

export const REWARDS = {
  kill: 300,
  win: 3250,
  loss: 1900,
  lossStreak: 500,
  plant: 300,
  defuse: 300,
};

export function canAfford(money, id) {
  const item = SHOP.find((entry) => entry.id === id);
  return item && money >= item.price;
}
