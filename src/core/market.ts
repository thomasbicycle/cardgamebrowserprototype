import { CONFIG } from '../config';
import { CARDS, baseValue } from './cards';
import { tierOf, type Condition } from './condition';
import { Rng, hashSeed } from './rng';

/** Current Near Mint raw price per card. Weekly drift arrives in Milestone 4. */
export interface MarketState {
  nm: Record<string, number>;
}

export function initMarket(rng: Rng): MarketState {
  const nm: Record<string, number> = {};
  const [lo, hi] = CONFIG.market.startSpread;
  for (const c of CARDS) nm[c.id] = baseValue(c) * rng.range(lo, hi);
  return { nm };
}

/** True market value of one raw copy: NM price scaled by its condition tier. */
export function rawValue(nmPrice: number, cond: Condition): number {
  return nmPrice * tierOf(cond.wear).rawMult;
}

/** Each card has its own fixed multiplier inside the configured range for a grade. */
export function gradeMultiplier(gameSeed: number, cardId: string, grade: number): number {
  const g = Math.min(10, Math.max(1, Math.round(grade)));
  const [lo, hi] = CONFIG.grading.multipliers[g];
  return lo + (hi - lo) * new Rng(hashSeed('gmult', gameSeed, cardId, g)).next();
}

export function gradedValue(gameSeed: number, cardId: string, nmPrice: number, grade: number, companyId: string): number {
  const co = CONFIG.grading.companies.find((c) => c.id === companyId);
  return nmPrice * gradeMultiplier(gameSeed, cardId, grade) * (co?.premium ?? 1);
}
