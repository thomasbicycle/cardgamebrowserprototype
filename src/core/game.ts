import { CONFIG } from '../config';
import type { TierId } from '../config';
import { tierId, type CardInstance } from './condition';
import { gradedValue, initMarket, rawValue, type MarketState } from './market';
import { Rng, hashSeed } from './rng';
import { generateSales, type Focus, type Sale } from './sales';
import { generateEncounter, makeOffer, passEncounter, type Encounter } from './seller';

/** A card sitting at a grading company. */
export interface GradingJob {
  company: string;
  service: string;
  submittedOn: number;
  /** Calendar day it comes back. */
  returnsOn: number;
  /** Hidden: decided at submission so it cannot be rerolled. */
  grade: number;
}
export interface Slab { company: string; grade: number; cert: number }

export interface OwnedCard {
  card: CardInstance;
  paid: number;
  /** Grading fees spent on this copy. */
  fees: number;
  trueValueAtBuy: number;
  boughtDay: number;
  grading?: GradingJob;
  slab?: Slab;
}

export interface DayLog {
  cashStart: number;
  seen: number;
  passed: number;
  walked: number;
  bought: { uid: number; cardId: string; paid: number; trueValue: number; tier: TierId }[];
  sold: { uid: number; cardId: string; price: number; cost: number; via: 'wholesale'; slab?: Slab }[];
  graded: { uid: number; cardId: string; company: string; fee: number }[];
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
  /** Uids back from grading whose grade the player has not looked at yet. */
  returns: number[];
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
  | { type: 'grade'; uid: number; company: string; service: string }
  | { type: 'wholesale'; uids: number[] }
  | { type: 'ackReturns' };

const emptyLog = (cashStart: number): DayLog => ({ cashStart, seen: 0, passed: 0, walked: 0, bought: [], sold: [], graded: [] });

export function createGame(seed: number): GameState {
  const rng = new Rng(hashSeed('game', seed));
  const market = initMarket(rng);
  return {
    v: 1, seed, rngState: rng.state, cash: CONFIG.startingCash, day: 0, phase: 'morning',
    show: null, log: emptyLog(CONFIG.startingCash), inventory: [], returns: [], market, nextUid: 1,
  };
}

export const weekOf = (day: number) => Math.floor(day / 2) + 1;
export const dayName = (day: number) => (day % 2 === 0 ? 'Saturday' : 'Sunday');
/** Calendar day number (week 1 Monday = 0), used to date sales history. */
export const calendarDay = (day: number) => (weekOf(day) - 1) * 7 + 5 + (day % 2);

/** First show day on or after a calendar day: "Wk 2 Sat". */
export function showDayOn(cal: number): number {
  const week = Math.floor(cal / 7);
  return week * 2 + (cal % 7 === 6 ? 1 : 0);
}
export const shortDay = (day: number) => `Wk ${weekOf(day)} ${dayName(day).slice(0, 3)}`;

export function salesFor(state: GameState, cardId: string, focus?: Focus[]): Sale[] {
  return generateSales(state.seed, cardId, calendarDay(state.day), () => state.market.nm[cardId], focus);
}

/** Hidden true market value of an owned copy right now, raw or slabbed. */
export function marketValue(state: GameState, o: OwnedCard): number {
  const nm = state.market.nm[o.card.cardId];
  return o.slab ? gradedValue(state.seed, o.card.cardId, nm, o.slab.grade, o.slab.company) : rawValue(nm, o.card.cond);
}

/** What the wholesale buyer pays on the spot. Whole dollars, never less than $1. */
export function wholesaleValue(state: GameState, o: OwnedCard): number {
  return Math.max(1, Math.floor(marketValue(state, o) * (o.slab ? CONFIG.wholesale.graded : CONFIG.wholesale.raw)));
}

export function gradingService(company: string, service: string) {
  const co = CONFIG.grading.companies.find((c) => c.id === company);
  const sv = co?.services.find((x) => x.id === service);
  return co && sv ? { co, sv } : null;
}

/** Grade a submission will get: true condition plus grader noise, rounded to 1-10. */
export function rollGrade(rng: Rng, overall: number): number {
  return Math.min(10, Math.max(1, Math.round(overall + rng.normal() * CONFIG.grading.variance)));
}

function closeDeal(state: GameState, enc: Encounter): void {
  const paid = enc.paid!;
  state.cash -= paid;
  state.inventory.push({ card: enc.card, paid, fees: 0, trueValueAtBuy: enc.trueValue, boughtDay: state.day });
  state.log.bought.push({ uid: enc.card.uid, cardId: enc.card.cardId, paid, trueValue: enc.trueValue, tier: tierId(enc.card.cond.wear) });
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
      state.log = emptyLog(state.cash);
      // Anything due back by this morning is waiting in the mail.
      const today = calendarDay(state.day);
      for (const o of state.inventory) {
        const job = o.grading;
        if (!job || job.returnsOn > today) continue;
        o.slab = { company: job.company, grade: job.grade, cert: hashSeed('cert', state.seed, o.card.uid) % 90000000 + 10000000 };
        delete o.grading;
        state.returns.push(o.card.uid);
      }
      break;
    }
    case 'grade': {
      const o = state.inventory.find((x) => x.card.uid === action.uid);
      const svc = gradingService(action.company, action.service);
      if (!o || !svc || o.grading || o.slab || state.cash < svc.sv.fee) break;
      const today = calendarDay(state.day);
      state.cash -= svc.sv.fee;
      o.fees += svc.sv.fee;
      o.grading = {
        company: svc.co.id, service: svc.sv.id, submittedOn: today,
        returnsOn: today + rng.int(svc.sv.days[0], svc.sv.days[1]),
        grade: rollGrade(rng, o.card.cond.overall),
      };
      state.log.graded.push({ uid: o.card.uid, cardId: o.card.cardId, company: svc.co.name, fee: svc.sv.fee });
      break;
    }
    case 'wholesale': {
      for (const uid of action.uids) {
        const i = state.inventory.findIndex((x) => x.card.uid === uid);
        const o = state.inventory[i];
        if (!o || o.grading) continue;
        const price = wholesaleValue(state, o);
        state.cash += price;
        state.inventory.splice(i, 1);
        state.log.sold.push({ uid, cardId: o.card.cardId, price, cost: o.paid + o.fees, via: 'wholesale', slab: o.slab });
      }
      break;
    }
    case 'ackReturns': {
      state.returns = [];
      break;
    }
  }
  state.rngState = rng.state;
}
