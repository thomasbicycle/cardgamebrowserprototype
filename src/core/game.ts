import { CONFIG } from '../config';
import type { CardInstance } from './condition';
import { initMarket, rawValue, type MarketState } from './market';
import { Rng, hashSeed } from './rng';
import { generateSales, type Sale } from './sales';
import { generateEncounter, makeOffer, passEncounter, type Encounter } from './seller';

export interface OwnedCard {
  card: CardInstance;
  paid: number;
  trueValueAtBuy: number;
  boughtDay: number;
}

export interface DayLog {
  seen: number;
  passed: number;
  walked: number;
  bought: { uid: number; cardId: string; paid: number; trueValue: number }[];
}

export interface ShowState {
  timeLeft: number;
  /** Hidden. */
  customersLeft: number;
  nextIn: number;
  encounter: Encounter | null;
}

/** Entire game as plain JSON, so it can be saved, replayed and tested. */
export interface GameState {
  v: 1;
  seed: number;
  rngState: number;
  cash: number;
  /** Show-day counter: 0 = week 1 Saturday, 1 = week 1 Sunday, 2 = week 2 Saturday... */
  day: number;
  phase: 'morning' | 'show' | 'dayEnd';
  show: ShowState | null;
  log: DayLog;
  inventory: OwnedCard[];
  market: MarketState;
  nextUid: number;
}

export type Action =
  | { type: 'startDay' }
  | { type: 'tick'; dt: number }
  | { type: 'offer'; amount: number }
  | { type: 'payAsk' }
  | { type: 'pass' }
  | { type: 'next' }
  | { type: 'nextDay' }
  | { type: 'wholesaleAll' };

const emptyLog = (): DayLog => ({ seen: 0, passed: 0, walked: 0, bought: [] });

export function createGame(seed: number): GameState {
  const rng = new Rng(hashSeed('game', seed));
  const market = initMarket(rng);
  return {
    v: 1, seed, rngState: rng.state, cash: CONFIG.startingCash, day: 0, phase: 'morning',
    show: null, log: emptyLog(), inventory: [], market, nextUid: 1,
  };
}

export const weekOf = (day: number) => Math.floor(day / 2) + 1;
export const dayName = (day: number) => (day % 2 === 0 ? 'Saturday' : 'Sunday');
/** Calendar day number (week 1 Monday = 0), used to date sales history. */
export const calendarDay = (day: number) => (weekOf(day) - 1) * 7 + 5 + (day % 2);

export function salesFor(state: GameState, cardId: string): Sale[] {
  return generateSales(state.seed, cardId, calendarDay(state.day), () => state.market.nm[cardId]);
}

export function wholesaleValue(state: GameState, owned: OwnedCard): number {
  return Math.floor(rawValue(state.market.nm[owned.card.cardId], owned.card.cond) * CONFIG.wholesale.raw);
}

function closeDeal(state: GameState, enc: Encounter): void {
  const paid = enc.paid!;
  state.cash -= paid;
  state.inventory.push({ card: enc.card, paid, trueValueAtBuy: enc.trueValue, boughtDay: state.day });
  state.log.bought.push({ uid: enc.card.uid, cardId: enc.card.cardId, paid, trueValue: enc.trueValue });
}

/** Applies an action by mutating `state`. All randomness comes from state.rngState. */
export function reduce(state: GameState, action: Action): void {
  const rng = new Rng(state.rngState);
  const show = state.show;
  const enc = show?.encounter ?? null;

  switch (action.type) {
    case 'startDay': {
      if (state.phase !== 'morning') break;
      const S = CONFIG.show;
      state.phase = 'show';
      state.log = emptyLog();
      state.show = {
        timeLeft: S.dayLengthSec,
        customersLeft: rng.int(S.customers[0], S.customers[1]),
        nextIn: rng.range(S.walkUpDelaySec[0], S.walkUpDelaySec[1]),
        encounter: null,
      };
      break;
    }
    case 'tick': {
      if (state.phase !== 'show' || !show) break;
      show.timeLeft = Math.max(0, show.timeLeft - action.dt);
      if (show.encounter) break; // the customer at the table always gets finished
      if (show.timeLeft <= 0 || show.customersLeft <= 0) {
        state.phase = 'dayEnd';
        break;
      }
      show.nextIn -= action.dt;
      if (show.nextIn <= 0) {
        show.customersLeft--;
        show.encounter = generateEncounter(rng, state.market, state.cash, state.nextUid++);
        state.log.seen++;
      }
      break;
    }
    case 'offer': {
      if (!enc || enc.status !== 'open' || action.amount > state.cash) break;
      const result = makeOffer(rng, enc, action.amount);
      if (result === 'deal') closeDeal(state, enc);
      if (result === 'walk') state.log.walked++;
      break;
    }
    case 'payAsk': {
      if (!enc || enc.status !== 'open' || enc.seller.currentAsk > state.cash) break;
      makeOffer(rng, enc, enc.seller.currentAsk);
      closeDeal(state, enc);
      break;
    }
    case 'pass': {
      if (!enc || enc.status !== 'open') break;
      passEncounter(rng, enc);
      state.log.passed++;
      break;
    }
    case 'next': {
      if (!show || !enc || enc.status === 'open') break;
      show.encounter = null;
      show.nextIn = rng.range(CONFIG.show.walkUpDelaySec[0], CONFIG.show.walkUpDelaySec[1]);
      if (show.timeLeft <= 0 || show.customersLeft <= 0) state.phase = 'dayEnd';
      break;
    }
    case 'nextDay': {
      if (state.phase !== 'dayEnd') break;
      state.day++;
      state.phase = 'morning';
      state.show = null;
      break;
    }
    case 'wholesaleAll': {
      // Temporary for Milestone 1 so cash can be recycled; replaced by real selling in M2.
      for (const o of state.inventory) state.cash += wholesaleValue(state, o);
      state.inventory = [];
      break;
    }
  }
  state.rngState = rng.state;
}
