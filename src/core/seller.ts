import { CONFIG } from '../config';
import { CARDS } from './cards';
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

// Opening patter is picked at random and never correlates with the card's real condition.
const INTROS = [
  'Pulled this {card} myself. Looking for {ask}.',
  "Got a {card} here. {ask} and it's yours.",
  'Pack fresh {card}, straight to sleeve. {ask}.',
  "{card}. Found it in my old binder. I'd take {ask}.",
  'You buying? {card}, {ask}.',
  "My kid's done collecting. {card} for {ask}?",
  'Clean {card}. I need {ask} for it.',
];
// Reactions depend on how the offer compares with what the seller would take, so the
// player can learn from them. "{worth}" is what the seller believes the card is worth.
const FAR = ["{offer}? That's way too light. I could maybe do {ask}.", 'Come on, {offer}? Be serious. {ask}.', "Careful, you're about to lose me. {ask}."];
const MID = ['Hmm. I could do {ask}.', 'Come up a bit. {ask}.', 'Best I can say right now is {ask}.', 'Meet me at {ask}.'];
const CLOSE = ["You're close. {ask} and we're done.", 'Almost. Make it {ask}.', "We're not far apart. {ask}?"];
const HOLD = ["You have to come up. I'm still at {ask}.", 'Same number, same answer: {ask}.', 'I moved, now you move. {ask}.', "You're not giving me anything. {ask}."];
const FINALS = ["{ask}. I'm about done here.", 'Last time I say it: {ask}.'];
const DEALS = ['Deal. Pleasure doing business.', "Sold. It's yours.", 'Works for me.'];
const EASY = ['Easy. Sold!', 'No haggling? I like you. Sold.', "Wow, that was quick. It's yours."];
const GRUDGING = ['Ugh... fine. You drive a hard bargain.', "That's the least I'd take. Deal.", "You're killing me. Okay, deal."];
const INSULTED = ["{offer}?! This is a {worth} card. I'm out.", '{offer} on a {worth} card? Not a chance. See ya.', "Wow. {offer}. I'll take my {worth} card to the next table."];
const FED_UP = ["We're going in circles. Forget it.", "I don't have all day. Pass."];
const PASSED = ['Alright, your loss.', "No worries. I'll shop it around."];

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const fill = (s: string, v: { card?: string; ask?: number; offer?: number; worth?: number }) =>
  s.replace('{card}', v.card ?? '').replace('{ask}', usd(v.ask ?? 0)).replace('{offer}', usd(v.offer ?? 0)).replace('{worth}', usd(v.worth ?? 0));

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
    let floor = ask * rng.range(S.floorFracOfAsk[0], S.floorFracOfAsk[1]);
    // Cheap cards: nobody fights over a couple of dollars, so the floor also drops by a flat amount.
    if (ask < S.cheap.askBelow) floor = Math.min(floor, ask - rng.range(S.cheap.floorDropDollars[0], S.cheap.floorDropDollars[1]));
    floor = Math.max(1, floor);
    const who = rng.int(0, NAMES.length - 1);
    best = {
      seller: {
        name: NAMES[who], avatar: AVATARS[who], bucket: bucket.id, ask, currentAsk: ask, floor,
        walkLine: Math.max(0, floor - Math.max(S.walkLineFracOfTrue * trueValue, S.minWalkGapDollars)),
        patience: rng.int(S.patience[0], S.patience[1]), counters: 0,
      },
      card, trueValue, status: 'open', offers: [],
      line: fill(rng.pick(INTROS), { card: def.name, ask }),
    };
    if (ask <= cash * S.affordFactor) break;
  }
  return best!;
}

/** Apply a player offer. Mutates the encounter and returns the outcome. */
export function makeOffer(rng: Rng, enc: Encounter, amount: number): OfferResult {
  if (enc.status !== 'open') throw new Error('Encounter is closed');
  const s = enc.seller;
  const offer = Math.max(0, Math.floor(amount));

  if (offer >= s.floor) {
    enc.status = 'deal';
    enc.paid = Math.min(offer, s.currentAsk);
    // Snapping up the ask reads as easy money; landing right on the floor gets a groan.
    enc.line = rng.pick(offer >= s.currentAsk ? EASY : offer <= s.floor * 1.06 ? GRUDGING : DEALS);
    enc.offers.push({ amount: offer, result: 'deal' });
    return 'deal';
  }
  if (offer <= s.walkLine || s.counters >= s.patience) {
    enc.status = 'walked';
    enc.line = fill(rng.pick(offer <= s.walkLine ? INSULTED : FED_UP), { offer, worth: s.ask });
    enc.offers.push({ amount: offer, result: 'walk' });
    return 'walk';
  }
  s.counters++;
  // 0 = offer right at the floor, 1 = offer right at the walk-away line.
  const gap = (s.floor - offer) / Math.max(0.01, s.floor - s.walkLine);
  const S = CONFIG.seller;
  const room = s.currentAsk - s.floor;
  let drop: number;
  if (enc.offers.length === 0) {
    // Opening move: a real concession, smaller if the offer was close to insulting.
    drop = room * rng.range(S.firstConcession[0], S.firstConcession[1]) * (1 - 0.5 * gap);
  } else {
    // After that they only give ground when the player does. Sitting on one number gets nothing.
    const raise = offer - Math.max(...enc.offers.map((o) => o.amount));
    drop = raise > 0 ? raise * rng.range(S.reciprocity[0], S.reciprocity[1]) : 0;
  }
  const held = drop <= 0;
  // Never close more than part of the remaining gap, so the ask does not walk down to the floor.
  drop = Math.min(drop, room * S.maxStepFrac);
  s.currentAsk = Math.max(Math.ceil(s.floor), Math.round(s.currentAsk - drop));
  const lines = held ? HOLD : s.counters >= s.patience ? FINALS : gap > 0.65 ? FAR : gap < 0.3 ? CLOSE : MID;
  enc.line = fill(rng.pick(lines), { ask: s.currentAsk, offer });
  enc.offers.push({ amount: offer, result: 'counter', counter: s.currentAsk });
  return 'counter';
}

export function passEncounter(rng: Rng, enc: Encounter): void {
  if (enc.status !== 'open') return;
  enc.status = 'passed';
  enc.line = rng.pick(PASSED);
}
