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

/**
 * Recent sold listings for one card. Derived from (seed, card, day) without touching
 * the game RNG, so opening the panel never changes what happens next.
 * `nmPriceAt(daysAgo)` lets history follow the market once prices drift.
 */
export function generateSales(
  gameSeed: number,
  cardId: string,
  day: number,
  nmPriceAt: (daysAgo: number) => number,
): Sale[] {
  const S = CONFIG.sales;
  const def = cardDef(cardId);
  const rng = new Rng(hashSeed('sales', gameSeed, cardId, day));
  const gradedShare = CONFIG.rarities[def.rarity].gradedShare;
  const tiers = Object.entries(S.rawTierWeights).map(([id, w]) => ({ id: id as TierId, w }));
  const grades = Object.entries(S.gradeWeights).map(([g, w]) => ({ g: Number(g), w }));
  const out: Sale[] = [];
  const n = rng.int(S.count[0], S.count[1]);

  for (let i = 0; i < n; i++) {
    const daysAgo = rng.int(0, S.lookbackDays);
    const nm = nmPriceAt(daysAgo);
    // The first few are always raw NM/LP so the base market is readable.
    const graded = i >= 3 && rng.chance(gradedShare);
    let fair: number;
    let label: string;
    const sale: Partial<Sale> = { daysAgo, kind: graded ? 'graded' : 'raw' };
    if (graded) {
      const grade = rng.weighted(grades).g;
      const co = rng.weighted(CONFIG.grading.companies.map((c) => ({ ...c, w: c.usable ? 3 : 1 })));
      fair = nm * gradeMultiplier(gameSeed, cardId, grade) * co.premium;
      sale.grade = grade;
      sale.company = co.name;
      label = `${co.name} ${grade}`;
    } else {
      const tier = i < 2 ? 'NM' : i === 2 ? 'LP' : rng.weighted(tiers).id;
      const t = CONFIG.condition.tiers.find((x) => x.id === tier)!;
      fair = nm * t.rawMult;
      sale.tier = tier;
      label = `Raw ${tier}`;
    }
    const eligible = CONFIG.marketplaces.filter((m) => (graded || m.raw) && fair >= m.minPrice);
    const mp = rng.weighted(eligible.length ? eligible : [CONFIG.marketplaces[0]]);
    let price = fair * mp.bias * Math.exp(rng.normal() * mp.noise);
    if (rng.chance(S.outlierChance)) {
      const o = rng.weighted(S.outliers);
      price *= rng.range(o.mult[0], o.mult[1]);
      sale.note = o.note;
    }
    price = Math.max(0.99, price >= 20 ? Math.floor(price) + rng.pick(CENTS) : Math.round(price * 100) / 100);
    out.push({
      ...(sale as Sale),
      marketplace: mp.name,
      price,
      title: `${def.name} ${cardNumber(def)} ${label}`,
    });
  }
  return out.sort((a, b) => a.daysAgo - b.daysAgo);
}
