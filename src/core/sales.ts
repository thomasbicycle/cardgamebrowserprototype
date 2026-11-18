import { CONFIG, type TierId } from '../config';
import { cardDef, cardNumber } from './cards';
import { gradeMultiplier } from './market';
import { Rng, hashSeed } from './rng';

export interface Sale {
  daysAgo: number;
  marketplace: string;
  kind: 'raw' | 'graded';
  tier?: TierId;
  company?: string;
  grade?: number;
  price: number;
  title: string;
  note?: string;
}

const CENTS = [0, 0, 0.5, 0.99, 0.95, 0.49];

export interface Focus { company: string; grade: number }
type NmAt = (daysAgo: number) => number;
type SaleKind = Pick<Sale, 'kind' | 'tier' | 'company' | 'grade'>;

/** Returns a function that adds one realistic sold listing to `out`, drawing from `rng`. */
function listingMaker(rng: Rng, cardId: string, nmPriceAt: NmAt, out: Sale[], ageBy: number) {
  const S = CONFIG.sales;
  const def = cardDef(cardId);
  return (sale: SaleKind, mult: number, label: string) => {
    const daysAgo = rng.int(0, S.lookbackDays) + ageBy;
    const fair = nmPriceAt(daysAgo) * mult;
    const graded = sale.kind === 'graded';
    const eligible = CONFIG.marketplaces.filter((m) => (graded || m.raw) && fair >= m.minPrice);
    const mp = rng.weighted(eligible.length ? eligible : [CONFIG.marketplaces[0]]);
    let price = fair * mp.bias * Math.exp(rng.normal() * mp.noise);
    let note: string | undefined;
    if (rng.chance(S.outlierChance)) {
      const o = rng.weighted(S.outliers);
      price *= rng.range(o.mult[0], o.mult[1]);
      note = o.note;
    }
    price = Math.max(0.99, price >= 20 ? Math.floor(price) + rng.pick(CENTS) : Math.round(price * 100) / 100);
    out.push({ ...sale, daysAgo, marketplace: mp.name, price, note, title: `${def.name} ${cardNumber(def)} ${label}` });
  };
}

/**
 * Recent sold listings for one card. Derived from (seed, card, day) without touching
 * the game RNG, so opening the panel never changes what happens next.
 * `nmPriceAt(daysAgo)` lets history follow the market once prices drift.
 * Each `focus` (company id + grade) is topped up independently so there are always enough comps for a slab.
 * `ageBy` shifts every sale back that many days, so one history can serve a whole weekend.
 */
export function generateSales(gameSeed: number, cardId: string, day: number, nmPriceAt: NmAt, focus: Focus[] = [], ageBy = 0): Sale[] {
  const S = CONFIG.sales;
  const def = cardDef(cardId);
  const out: Sale[] = [];
  const rng = new Rng(hashSeed('sales', gameSeed, cardId, day));
  const add = listingMaker(rng, cardId, nmPriceAt, out, ageBy);
  const grades = Object.entries(S.gradeWeights).map(([g, w]) => ({ g: Number(g), w }));
  const slab = (co: (typeof CONFIG.grading.companies)[number], grade: number) =>
    add({ kind: 'graded', grade, company: co.name }, gradeMultiplier(gameSeed, cardId, grade) * co.premium, `${co.name} ${grade}`);

  for (const t of CONFIG.condition.tiers) {
    const [lo, hi] = S.rawPerTier[t.id];
    for (let n = rng.int(lo, hi); n > 0; n--) add({ kind: 'raw', tier: t.id as TierId }, t.rawMult, `Raw ${t.id}`);
  }
  const [glo, ghi] = CONFIG.rarities[def.rarity].gradedSales;
  for (let n = rng.int(glo, ghi); n > 0; n--) {
    const grade = rng.weighted(grades).g;
    slab(rng.weighted(CONFIG.grading.companies.map((c) => ({ ...c, w: c.services.length ? 3 : 1 }))), grade);
  }
  for (const f of focus) {
    const co = CONFIG.grading.companies.find((c) => c.id === f.company)!;
    const fr = new Rng(hashSeed('sales-focus', gameSeed, cardId, day, co.id, f.grade));
    const have = out.filter((s) => s.company === co.name && s.grade === f.grade).length;
    const addFocus = listingMaker(fr, cardId, nmPriceAt, out, ageBy);
    const mult = gradeMultiplier(gameSeed, cardId, f.grade) * co.premium;
    for (let n = fr.int(S.focusComps[0], S.focusComps[1]) - have; n > 0; n--) addFocus({ kind: 'graded', grade: f.grade, company: co.name }, mult, `${co.name} ${f.grade}`);
  }
  return out.sort((a, b) => a.daysAgo - b.daysAgo);
}

/** Median of the recent sales for one company + grade (with outliers included, like a real search). */
export function medianSale(sales: Sale[], company: string, grade: number): number {
  const p = sales.filter((s) => s.company === company && s.grade === grade).map((s) => s.price).sort((a, b) => a - b);
  return p.length ? p[Math.floor(p.length / 2)] : 0;
}

/**
 * The wholesaler comp: average the most recent clean sales that `match`, then lean toward the newest.
 * Outliers (auctions, bad listings: anything with a note) are skipped, as a dealer would.
 * `sales` must be newest first, as generateSales returns them. Null when nothing matches.
 */
export function compPrice(sales: Sale[], match: (s: Sale) => boolean): number | null {
  const { last, recentWeight } = CONFIG.sales.comp;
  const recent = sales.filter((s) => match(s) && !s.note).slice(0, last);
  if (!recent.length) return null;
  const avg = recent.reduce((t, s) => t + s.price, 0) / recent.length;
  return avg + (recent[0].price - avg) * recentWeight;
}
