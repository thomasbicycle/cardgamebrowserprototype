import { CONFIG, type RarityId } from '../config';

export type Element = 'ember' | 'tide' | 'moss' | 'volt' | 'stone' | 'gale' | 'frost' | 'dusk';

export interface CardDef {
  id: string;
  num: number;
  name: string;
  element: Element;
  rarity: RarityId;
  /** 0..1 position inside the rarity's value range. */
  pos: number;
  power: number;
  move: string;
}

export const SET_NAME = 'Wildkin · First Bloom';
export const SET_SIZE = 30;

// [name, element, rarity, pos, move] — all original creatures.
const RAW: [string, Element, RarityId, number, string][] = [
  ['Pebblit', 'stone', 'common', 0.1, 'Tumble'],
  ['Mossnub', 'moss', 'common', 0.3, 'Sprout Bop'],
  ['Driplet', 'tide', 'common', 0.5, 'Puddle Hop'],
  ['Sootkin', 'ember', 'common', 0.8, 'Smolder'],
  ['Zapple', 'volt', 'common', 0.6, 'Static Nip'],
  ['Breezle', 'gale', 'common', 0.2, 'Gust Giggle'],
  ['Snowmit', 'frost', 'common', 0.4, 'Cold Pat'],
  ['Gloomlet', 'dusk', 'common', 1.0, 'Shadow Peek'],
  ['Twiglin', 'moss', 'common', 0.0, 'Twig Jab'],
  ['Siltie', 'stone', 'common', 0.15, 'Mud Flick'],
  ['Fizzbug', 'volt', 'common', 0.7, 'Fizz Pop'],
  ['Puffawn', 'gale', 'common', 0.9, 'Fluff Dash'],
  ['Cragmaw', 'stone', 'uncommon', 0.2, 'Boulder Bite'],
  ['Fernhorn', 'moss', 'uncommon', 0.4, 'Frond Charge'],
  ['Tidefin', 'tide', 'uncommon', 0.6, 'Rip Current'],
  ['Emberoo', 'ember', 'uncommon', 0.9, 'Coal Kick'],
  ['Buzzwick', 'volt', 'uncommon', 0.7, 'Arc Flicker'],
  ['Skywhirl', 'gale', 'uncommon', 0.1, 'Updraft'],
  ['Rimeclaw', 'frost', 'uncommon', 0.5, 'Glacier Rake'],
  ['Duskpaw', 'dusk', 'uncommon', 1.0, 'Night Prowl'],
  ['Thornback', 'moss', 'uncommon', 0.0, 'Bramble Wall'],
  ['Scorchmaul', 'ember', 'rare', 0.8, 'Molten Slam'],
  ['Torrentusk', 'tide', 'rare', 0.3, 'Flood Gore'],
  ['Stormantle', 'volt', 'rare', 0.55, 'Thunder Cloak'],
  ['Glaciarch', 'frost', 'rare', 0.1, 'Permafrost Crown'],
  ['Verdantler', 'moss', 'rare', 0.0, 'Canopy Crash'],
  ['Nocfang', 'dusk', 'rare', 1.0, 'Eclipse Bite'],
  ['Solaryx', 'ember', 'ultra', 0.6, 'Dawn Flare'],
  ['Abyssire', 'tide', 'ultra', 0.0, 'Trench Call'],
  ['Chronoth', 'stone', 'ultra', 1.0, 'Epoch Quake'],
];

const POWER: Record<RarityId, number> = { common: 40, uncommon: 80, rare: 130, ultra: 200 };

export const CARDS: CardDef[] = RAW.map(([name, element, rarity, pos, move], i) => ({
  id: name.toLowerCase(),
  num: i + 1,
  name,
  element,
  rarity,
  pos,
  power: POWER[rarity] + Math.round(pos * 4) * 10,
  move,
}));

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export function cardDef(id: string): CardDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown card ${id}`);
  return d;
}

/** Long-run Near Mint raw value before market movement. */
export function baseValue(def: CardDef): number {
  const [lo, hi] = CONFIG.rarities[def.rarity].value;
  return lo + (hi - lo) * def.pos;
}

export function cardNumber(def: CardDef): string {
  return `${String(def.num).padStart(3, '0')}/${String(SET_SIZE).padStart(3, '0')}`;
}
