import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { conditionFromOverall, generateFlaws, rollCondition, tierId } from '../src/core/condition';
import { createGame, reduce, salesFor, type Action } from '../src/core/game';
import { initMarket } from '../src/core/market';
import { Rng } from '../src/core/rng';
import { generateEncounter, makeOffer } from '../src/core/seller';

const encounters = (n: number, seed = 7) => {
  const rng = new Rng(seed);
  const market = initMarket(rng);
  return { rng, list: Array.from({ length: n }, (_, i) => generateEncounter(rng, market, 1e9, i)) };
};

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(42), b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });
});

describe('condition', () => {
  it('overall is the worst sub-score and maps to tiers', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const c = rollCondition(rng);
      expect(c.overall).toBeCloseTo(Math.min(c.centering, c.corners, c.edges, c.surface), 5);
      expect(c.overall).toBeGreaterThanOrEqual(1);
      expect(c.overall).toBeLessThanOrEqual(10);
    }
    expect([9.6, 8, 7, 5, 3, 1.5].map(tierId)).toEqual(['NM', 'NM', 'LP', 'MP', 'HP', 'DMG']);
  });
  it('worse cards get more visible flaws; flaws are stable per card', () => {
    const rng = new Rng(3);
    const mk = (o: number) => ({ uid: 1, cardId: 'pebblit', seed: 99, cond: conditionFromOverall(rng, o) });
    const gem = generateFlaws(mk(10)), beat = generateFlaws(mk(2));
    expect(gem.whitening.length + gem.scratches.length).toBeLessThan(3);
    expect(beat.whitening.length).toBeGreaterThan(30);
    expect(beat.creases.length).toBeGreaterThan(0);
    const card = mk(7);
    expect(generateFlaws(card)).toEqual(generateFlaws(card));
  });
});

describe('sellers', () => {
  it('asks follow the configured buckets', () => {
    const { list } = encounters(4000);
    const share = (b: string) => list.filter((e) => e.seller.bucket === b).length / list.length;
    expect(share('normal')).toBeCloseTo(0.76, 1);
    expect(share('clueless')).toBeCloseTo(0.12, 1);
    for (const e of list.filter((x) => x.seller.bucket === 'normal' && x.trueValue > 50)) {
      const pct = e.seller.ask / e.trueValue;
      expect(pct).toBeGreaterThan(0.84);
      expect(pct).toBeLessThan(1.01);
    }
  });
  it('accepts at the floor, walks at the walk line, counters in between', () => {
    const { rng, list } = encounters(300);
    for (const e of list.filter((x) => x.trueValue > 40)) {
      const s = e.seller;
      expect(s.walkLine).toBeCloseTo(Math.max(0, s.floor - CONFIG.seller.walkLineFracOfTrue * e.trueValue), 5);
      const a = structuredClone(e), b = structuredClone(e), c = structuredClone(e);
      expect(makeOffer(rng, a, Math.ceil(s.floor))).toBe('deal');
      expect(a.paid).toBe(Math.ceil(s.floor));
      expect(makeOffer(rng, b, Math.floor(s.walkLine))).toBe('walk');
      const mid = Math.floor((s.floor + s.walkLine) / 2);
      if (mid > s.walkLine && mid < s.floor) {
        let asks = [s.ask];
        for (let i = 0; i < s.patience; i++) {
          expect(makeOffer(rng, c, mid)).toBe('counter');
          asks.push(c.seller.currentAsk);
          expect(c.seller.currentAsk).toBeGreaterThanOrEqual(s.floor);
        }
        expect(asks).toEqual([...asks].sort((x, y) => y - x));
        expect(makeOffer(rng, c, mid)).toBe('walk');
      }
    }
  });
});

describe('sales', () => {
  it('are deterministic and centred on the true NM price', () => {
    const g = createGame(5);
    expect(salesFor(g, 'nocfang')).toEqual(salesFor(g, 'nocfang'));
    const ratios: number[] = [];
    for (const id of Object.keys(g.market.nm)) {
      for (const s of salesFor(g, id)) if (s.tier === 'NM' && !s.note) ratios.push(s.price / g.market.nm[id]);
    }
    ratios.sort((a, b) => a - b);
    const median = ratios[Math.floor(ratios.length / 2)];
    expect(median).toBeGreaterThan(0.93);
    expect(median).toBeLessThan(1.1);
  });
});

describe('game', () => {
  const play = (seed: number) => {
    const g = createGame(seed);
    const acts: Action[] = [{ type: 'startDay' }];
    for (let i = 0; i < 400; i++) acts.push({ type: 'tick', dt: 1 }, { type: 'payAsk' }, { type: 'next' });
    for (const a of acts) reduce(g, a);
    return g;
  };
  it('same seed and actions give the same run', () => {
    expect(play(11)).toEqual(play(11));
    expect(play(11)).not.toEqual(play(12));
  });
  it('a day ends, cash and inventory stay consistent', () => {
    const g = play(11);
    expect(g.phase).toBe('dayEnd');
    expect(g.log.bought.length).toBe(g.inventory.length);
    expect(g.cash).toBe(CONFIG.startingCash - g.inventory.reduce((s, o) => s + o.paid, 0));
    expect(g.cash).toBeGreaterThanOrEqual(0);
  });
});
