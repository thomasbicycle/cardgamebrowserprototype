import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { conditionFromWear, generateFlaws, marksFor, maxSpread, rollCondition, tierId } from '../src/core/condition';
import { calendarDay, createGame, marketValue, rawMarketValue, reduce, rollGrade, salesFor, showDayOn, wholesaleValue, type Action, type GameState } from '../src/core/game';
import { initMarket, rawValue } from '../src/core/market';
import { compPrice, type Sale } from '../src/core/sales';
import { Rng } from '../src/core/rng';
import { generateEncounter, makeOffer } from '../src/core/seller';

const encounters = (n: number, seed = 7) => {
  const rng = new Rng(seed);
  const market = initMarket(rng);
  return { rng, list: Array.from({ length: n }, (_, i) => generateEncounter(rng, (id, c) => rawValue(market.nm[id], c), 1e9, i)) };
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
      expect(c.wear).toBeCloseTo(Math.min(c.corners, c.edges, c.surface), 5);
      expect(c.overall).toBeCloseTo(Math.min(c.wear, c.centering), 5);
      expect(Math.max(c.corners, c.edges, c.surface) - c.wear).toBeLessThanOrEqual(maxSpread(c.wear) + 0.01);
      expect(c.overall).toBeGreaterThanOrEqual(1);
      expect(c.overall).toBeLessThanOrEqual(10);
    }
    expect([9.6, 8, 7, 5, 3, 1.5].map(tierId)).toEqual(['NM', 'NM', 'LP', 'MP', 'HP', 'DMG']);
  });
  it('worse cards get more visible flaws; flaws are stable per card', () => {
    const rng = new Rng(3);
    const mk = (o: number) => ({ uid: 1, cardId: 'pebblit', seed: rng.int(1, 1e9), cond: conditionFromWear(rng, o) });
    const marks = (o: number) => {
      let n = 0;
      for (let i = 0; i < 30; i++) {
        const f = generateFlaws(mk(o));
        n += f.whitening.length + f.scratches.length + f.scuffs.length;
      }
      return n / 30;
    };
    expect(marks(10)).toBeLessThan(1);
    // Each tier down is clearly busier than the one above it.
    const byTier = [9, 7, 5.2, 3.5, 1.5].map(marks);
    for (let i = 1; i < byTier.length; i++) expect(byTier[i]).toBeGreaterThan(byTier[i - 1] * 1.4);
    for (let i = 0; i < 30; i++) {
      const lp = generateFlaws(mk(7)), hp = generateFlaws(mk(3.5)), dmg = generateFlaws(mk(1.8));
      expect(lp.creases.length + lp.tears.length + lp.stains.length).toBe(0);
      expect(hp.tears.length + hp.stains.length).toBe(0);
      expect(dmg.tears.length + dmg.stains.length + dmg.creases.filter((c) => c.w > 1).length).toBeGreaterThan(0);
    }
    const card = mk(7);
    expect(generateFlaws(card)).toEqual(generateFlaws(card));
  });
  it('walk-ups follow the tier shares', () => {
    const rng = new Rng(11);
    const n = 6000, seen: Record<string, number> = {};
    for (let i = 0; i < n; i++) { const t = tierId(rollCondition(rng).wear); seen[t] = (seen[t] ?? 0) + 1; }
    const D = CONFIG.condition.distribution, total = Object.values(D).reduce((a, b) => a + b, 0);
    for (const [t, w] of Object.entries(D)) expect(Math.abs(seen[t] / n - w / total)).toBeLessThan(0.02);
  });
  it('counting marks gives the right tier; marks never merge; no creases above HP', () => {
    const rng = new Rng(12);
    const ranges = Object.entries(CONFIG.condition.marks);
    for (let i = 0; i < 1500; i++) {
      const cond = rollCondition(rng);
      const f = generateFlaws({ uid: i, cardId: 'pebblit', seed: rng.int(1, 1e9), cond });
      const tier = tierId(cond.wear);
      const n = f.whitening.length + f.scratches.length + f.scuffs.length;
      expect(n).toBe(marksFor(cond.wear));
      // The only tier whose range holds this count is the card's own tier.
      expect(ranges.filter(([, [lo, hi]]) => n >= lo && n <= hi).map(([t]) => t)).toEqual([tier]);
      if (tier === 'NM' || tier === 'LP' || tier === 'MP') {
        expect(f.creases.length).toBe(0);
        const pts = [...f.whitening.map((w) => [w.x, w.y]), ...f.scratches.map((l) => [(l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2]), ...f.scuffs.map((u) => [u.x, u.y])];
        for (let j = 0; j < pts.length; j++) for (let k = j + 1; k < pts.length; k++) {
          expect(Math.hypot(pts[j][0] - pts[k][0], pts[j][1] - pts[k][1])).toBeGreaterThanOrEqual(CONFIG.flaws.minGap - 1e-9);
        }
      }
      if (tier === 'HP') expect(f.creases.length).toBeLessThanOrEqual(2);
    }
    // Gem-mint candidates are spotless.
    expect(marksFor(9.6)).toBe(0);
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
      expect(s.walkLine).toBeCloseTo(s.floor - CONFIG.seller.walkLineFracOfTrue * e.trueValue, 5);
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

describe('haggling cannot be gamed by repeating one offer', () => {
  it('seller holds until the player comes up, and never shows the floor', () => {
    const { rng, list } = encounters(600);
    let checked = 0;
    for (const e of list.filter((x) => x.trueValue > 60)) {
      const s = e.seller;
      const low = Math.floor(s.walkLine) + 2;
      if (low >= s.floor - 6) continue;
      checked++;
      const stay = structuredClone(e), climb = structuredClone(e);
      makeOffer(rng, stay, low);
      const afterFirst = stay.seller.currentAsk;
      expect(afterFirst).toBeLessThanOrEqual(s.ask);
      while (stay.status === 'open') makeOffer(rng, stay, low);
      expect(stay.status).toBe('walked');
      expect(stay.seller.currentAsk).toBe(afterFirst);
      expect(afterFirst - s.floor).toBeGreaterThanOrEqual((s.ask - s.floor) * 0.55 - 0.5);

      makeOffer(rng, climb, low);
      const before = climb.seller.currentAsk;
      makeOffer(rng, climb, low + 3);
      if (before - s.floor > 6) expect(climb.seller.currentAsk).toBeLessThan(before);
      expect(climb.seller.currentAsk).toBeGreaterThanOrEqual(s.floor);
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('cheap cards', () => {
  it('can be lowballed without the seller storming off', () => {
    const { rng, list } = encounters(3000);
    const cheap = list.filter((e) => e.seller.ask < 15);
    expect(cheap.length).toBeGreaterThan(100);
    for (const e of cheap) expect(makeOffer(rng, e, Math.round(e.seller.ask * 0.7))).not.toBe('walk');
  });
});

describe('sales', () => {
  it('every raw condition has at least 5 comps', () => {
    const g = createGame(9);
    for (const id of Object.keys(g.market.nm)) {
      const sales = salesFor(g, id);
      for (const t of CONFIG.condition.tiers) expect(sales.filter((s) => s.tier === t.id).length).toBeGreaterThanOrEqual(5);
    }
  });
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

describe('true value comes from the comps', () => {
  const sale = (price: number, daysAgo: number, note?: string): Sale =>
    ({ price, daysAgo, note, kind: 'raw', tier: 'NM', marketplace: 'eBuy', title: '' });
  it('averages the last 3 clean sales and leans toward the newest', () => {
    // The wholesaler example: $375 (newest), $290, $325 -> $352.50.
    expect(compPrice([sale(375, 1), sale(290, 3), sale(325, 6), sale(900, 9)], () => true)).toBeCloseTo(352.5, 5);
    // Auctions and bad listings are skipped.
    expect(compPrice([sale(120, 0, 'Auction · 31 bids'), sale(100, 1), sale(100, 2), sale(100, 3)], () => true)).toBeCloseTo(100, 5);
    expect(compPrice([], () => true)).toBeNull();
  });
  it('raw value matches its condition comps, and clean sales sit close to it', () => {
    const g = createGame(5);
    const rng = new Rng(2);
    for (const id of Object.keys(g.market.nm)) {
      const cond = rollCondition(rng);
      const v = rawMarketValue(g, id, cond);
      const tier = tierId(cond.wear);
      const sales = salesFor(g, id).filter((s) => s.tier === tier && !s.note);
      expect(v).toBeCloseTo(compPrice(sales, () => true)!, 5);
      for (const s of sales) expect(Math.abs(Math.log(s.price / v))).toBeLessThan(0.35);
    }
  });
  it('one history per weekend: on Sunday every sale is a day older', () => {
    const g = createGame(6);
    const sat = salesFor(g, 'pebblit');
    g.day = 1;
    expect(salesFor(g, 'pebblit').map((s) => s.daysAgo)).toEqual(sat.map((s) => s.daysAgo + 1));
    expect(salesFor(g, 'pebblit').map((s) => s.price)).toEqual(sat.map((s) => s.price));
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

describe('grading, returns and wholesale', () => {
  /** A game with a few cards in stock and the show day over. */
  const stocked = (seed: number) => {
    const g = createGame(seed);
    g.cash = 1e6;
    const acts: Action[] = [{ type: 'startDay' }];
    for (let i = 0; i < 400; i++) acts.push({ type: 'tick', dt: 1 }, { type: 'payAsk' }, { type: 'next' });
    for (const a of acts) reduce(g, a);
    expect(g.inventory.length).toBeGreaterThan(2);
    return g;
  };
  const advance = (g: GameState, days: number) => {
    for (let i = 0; i < days; i++) {
      reduce(g, { type: 'nextDay' });
      reduce(g, { type: 'ackReturns' });
      reduce(g, { type: 'startDay' });
      while (g.phase === 'show') reduce(g, { type: 'tick', dt: 1000 });
    }
  };

  it('grades land near true condition', () => {
    const rng = new Rng(4);
    let off = 0;
    for (let i = 0; i < 2000; i++) {
      const overall = rng.range(1, 10);
      const gr = rollGrade(rng, overall);
      expect(gr).toBeGreaterThanOrEqual(1);
      expect(gr).toBeLessThanOrEqual(10);
      expect(Math.abs(gr - overall)).toBeLessThan(2);
      if (gr !== Math.round(overall)) off++;
    }
    expect(off / 2000).toBeGreaterThan(0.1); // graders are not perfectly predictable
    expect(off / 2000).toBeLessThan(0.5);
  });

  it('charges the fee, returns on time, and the slab is worth the graded price', () => {
    const g = stocked(21);
    const [a, b] = g.inventory;
    const cash = g.cash;
    reduce(g, { type: 'grade', uid: a.card.uid, company: 'pra', service: 'fast' });
    reduce(g, { type: 'grade', uid: b.card.uid, company: 'cgx', service: 'value' });
    reduce(g, { type: 'grade', uid: a.card.uid, company: 'cgx', service: 'value' }); // already submitted: ignored
    expect(g.cash).toBe(cash - 115);
    expect(a.fees).toBe(100);
    expect(g.log.graded.length).toBe(2);
    // Cannot wholesale a card that is at the grader.
    reduce(g, { type: 'wholesale', uids: [a.card.uid] });
    expect(g.inventory).toContain(a);

    const praDue = a.grading!.returnsOn, cgxDue = b.grading!.returnsOn;
    const praGrade = a.grading!.grade;
    expect(praDue - calendarDay(g.day)).toBeLessThanOrEqual(5);
    expect(cgxDue - calendarDay(g.day)).toBeGreaterThanOrEqual(18);
    // PRA is always back by the next show day.
    reduce(g, { type: 'nextDay' });
    if (g.day % 2 === 1) { reduce(g, { type: 'startDay' }); while (g.phase === 'show') reduce(g, { type: 'tick', dt: 1000 }); reduce(g, { type: 'nextDay' }); }
    expect(g.day).toBe(showDayOn(praDue));
    expect(a.slab?.grade).toBe(praGrade);
    expect(a.grading).toBeUndefined();
    expect(g.returns).toContain(a.card.uid);
    expect(b.slab).toBeUndefined();
    expect(wholesaleValue(g, a)).toBe(Math.max(1, Math.floor(marketValue(g, a) * CONFIG.wholesale.graded)));

    reduce(g, { type: 'ackReturns' });
    advance(g, 8);
    expect(b.slab).toBeDefined();
    expect(g.day).toBeGreaterThanOrEqual(showDayOn(cgxDue));
  });

  it('cannot grade without the fee in cash', () => {
    const g = stocked(22);
    g.cash = 50;
    const o = g.inventory[0];
    reduce(g, { type: 'grade', uid: o.card.uid, company: 'pra', service: 'fast' });
    expect(o.grading).toBeUndefined();
    expect(g.cash).toBe(50);
  });

  it('wholesale pays 80% of raw market and removes the cards', () => {
    const g = stocked(23);
    const cash = g.cash;
    const uids = g.inventory.map((o) => o.card.uid);
    const expected = g.inventory.reduce((s, o) => s + Math.max(1, Math.floor(marketValue(g, o) * CONFIG.wholesale.raw)), 0);
    reduce(g, { type: 'wholesale', uids });
    expect(g.inventory.length).toBe(0);
    expect(g.cash).toBe(cash + expected);
    expect(g.log.sold.length).toBe(uids.length);
  });

  it('every slab has at least 5 comps for its company and grade', () => {
    const g = createGame(9);
    for (const company of ['pra', 'cgx']) {
      for (const grade of [10, 9, 8, 7, 5, 3, 1]) {
        const sales = salesFor(g, 'pebblit', [{ company, grade }]);
        const name = CONFIG.grading.companies.find((c) => c.id === company)!.name;
        expect(sales.filter((s) => s.company === name && s.grade === grade).length).toBeGreaterThanOrEqual(5);
        // Topping up one slab never changes the rest of the history.
        expect(sales.filter((s) => s.kind === 'raw')).toEqual(salesFor(g, 'pebblit').filter((s) => s.kind === 'raw'));
      }
    }
  });
});
