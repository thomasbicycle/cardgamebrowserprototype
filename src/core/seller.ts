import { CONFIG } from '../config';
import { CARDS, cardDef } from './cards';
import { rollCondition, type CardInstance } from './condition';
import { rawValue, type MarketState } from './market';
import type { Rng } from './rng';

export interface Seller {
  name: string;
  avatar: string;
  bucket: string;
  /** Opening ask and the ask after any counters. Whole dollars. */
  ask: number;
  currentAsk: number;
  /** Hidden: lowest price they will take. */
  floor: number;
  /** Hidden: an offer at or below this makes them leave. */
  walkLine: number;
  /** Hidden: counters they will make before giving up. */
  patience: number;
  counters: number;
}

export type OfferResult = 'deal' | 'counter' | 'walk';
export interface OfferRecord { amount: number; result: OfferResult; counter?: number }

export interface Encounter {
  seller: Seller;
  card: CardInstance;
  /** Hidden true market value of this copy when the seller walked up. */
  trueValue: number;
  status: 'open' | 'deal' | 'walked' | 'passed';
  paid?: number;
  line: string;
  offers: OfferRecord[];
}

const NAMES = ['Marcus', 'Dee', 'Old Tom', 'Priya', 'Jax', 'Renée', 'Big Al', 'Suki', 'Walt', 'Nico', 'Tasha', 'Gus', 'Imani', 'Cole', 'Bea', 'Hiro'];
const AVATARS = ['🧔', '👩', '👴', '🧑', '👦', '👩‍🦰', '🧓', '👧', '👨‍🦳', '🧑‍🦱', '👩‍🦱', '👨', '👩‍🦳', '🧢', '👵', '🧑‍🦰'];

// Sales patter is picked at random and never correlates with the card's real condition.
const INTROS = [
  'Pulled this {card} myself. Looking for ${ask}.',
  "Got a {card} here. ${ask} and it's yours.",
  'Pack fresh {card}, straight to sleeve. ${ask}.',
  "{card}. Found it in my old binder. I'd take ${ask}.",
  'You buying? {card}, ${ask}.',
  "My kid's done collecting. {card} for ${ask}?",
  'Clean {card}. I need ${ask} for it.',
];
const COUNTERS = ['Hmm. I could do ${ask}.', 'Come up a bit. ${ask}.', "Best I can say right now is ${ask}.", 'Meet me at ${ask}.'];
const FINALS = ["${ask}. That's as low as I go.", 'Last number: ${ask}.'];
const DEALS = ['Deal. Pleasure doing business.', "Sold. It's yours.", 'Works for me.'];
const INSULTED = ["That's insulting. I'm out.", 'Not even close. See ya.', "I'll try the next table."];
const FED_UP = ["We're going in circles. Forget it.", "I don't have all day. Pass."];
const PASSED = ['Alright, your loss.', "No worries. I'll shop it around."];

const fill = (s: string, card: string, ask: number) =>
  s.replace('{card}', card).replace('${ask}', `$${ask.toLocaleString('en-US')}`);

export function generateEncounter(rng: Rng, market: MarketState, cash: number, uid: number): Encounter {
  const S = CONFIG.seller;
  let best: Encounter | null = null;
  for (let attempt = 0; attempt <= S.affordRerolls; attempt++) {
    const rarity = rng.weighted(Object.entries(CONFIG.rarities).map(([id, r]) => ({ id, w: r.w }))).id;
    const def = rng.pick(CARDS.filter((c) => c.rarity === rarity));
    const card: CardInstance = { uid, cardId: def.id, seed: rng.int(1, 2 ** 31 - 1), cond: rollCondition(rng) };
    const trueValue = rawValue(market.nm[def.id], card.cond);
    const bucket = rng.weighted(S.askBuckets);
    const ask = Math.max(1, Math.round(trueValue * rng.range(bucket.range[0], bucket.range[1])));
    const floor = ask * rng.range(S.floorFracOfAsk[0], S.floorFracOfAsk[1]);
    const who = rng.int(0, NAMES.length - 1);
    best = {
      seller: {
        name: NAMES[who], avatar: AVATARS[who], bucket: bucket.id, ask, currentAsk: ask, floor,
        walkLine: Math.max(0, floor - S.walkLineFracOfTrue * trueValue),
        patience: rng.int(S.patience[0], S.patience[1]), counters: 0,
      },
      card, trueValue, status: 'open', offers: [],
      line: fill(rng.pick(INTROS), def.name, ask),
    };
    if (ask <= cash * S.affordFactor) break;
  }
  return best!;
}

/** Apply a player offer. Mutates the encounter and returns the outcome. */
export function makeOffer(rng: Rng, enc: Encounter, amount: number): OfferResult {
  if (enc.status !== 'open') throw new Error('Encounter is closed');
  const s = enc.seller;
  const name = cardDef(enc.card.cardId).name;
  const offer = Math.max(0, Math.floor(amount));

  if (offer >= s.floor) {
    enc.status = 'deal';
    enc.paid = Math.min(offer, s.currentAsk);
    enc.line = rng.pick(DEALS);
    enc.offers.push({ amount: offer, result: 'deal' });
    return 'deal';
  }
  if (offer <= s.walkLine || s.counters >= s.patience) {
    enc.status = 'walked';
    enc.line = rng.pick(offer <= s.walkLine ? INSULTED : FED_UP);
    enc.offers.push({ amount: offer, result: 'walk' });
    return 'walk';
  }
  s.counters++;
  const [lo, hi] = CONFIG.seller.concession;
  const target = s.currentAsk - (s.currentAsk - s.floor) * rng.range(lo, hi);
  // Always move at least $1 when there is room, never below the floor.
  s.currentAsk = Math.max(Math.ceil(s.floor), Math.min(s.currentAsk - 1, Math.round(target)));
  enc.line = fill(rng.pick(s.counters >= s.patience ? FINALS : COUNTERS), name, s.currentAsk);
  enc.offers.push({ amount: offer, result: 'counter', counter: s.currentAsk });
  return 'counter';
}

export function passEncounter(rng: Rng, enc: Encounter): void {
  if (enc.status !== 'open') return;
  enc.status = 'passed';
  enc.line = rng.pick(PASSED);
}
