import { CONFIG, type TierId } from '../config';
import { Rng, hashSeed } from './rng';

/**
 * Hidden true condition, each score 1-10.
 * `wear` (worst of corners/edges/surface) sets the raw tier: NM, LP, MP, HP, DMG.
 * `overall` (worst of wear and centering) is what a grader would score.
 */
export interface Condition {
  overall: number;
  wear: number;
  centering: number;
  corners: number;
  edges: number;
  surface: number;
}

/** One physical copy of a card. `seed` fixes where its flaws are drawn. */
export interface CardInstance {
  uid: number;
  cardId: string;
  seed: number;
  cond: Condition;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function conditionFromWear(rng: Rng, wearScore: number, centeringScore?: number): Condition {
  const C = CONFIG.condition;
  const wear = r2(clamp(wearScore, 1, 10));
  const keys = ['corners', 'edges', 'surface'] as const;
  const limiting = new Set<string>([rng.pick(keys)]);
  if (rng.chance(0.4)) limiting.add(rng.pick(keys));
  const room = Math.min(10 - wear, C.maxSpread);
  const sub = (k: string) => (limiting.has(k) ? wear : r2(wear + room * Math.pow(rng.next(), 1.5)));
  const corners = sub('corners'), edges = sub('edges'), surface = sub('surface');
  const rolled = r2(clamp(10 - Math.abs(rng.normal()) * C.centering.sd, C.centering.min, 10));
  const centering = centeringScore ?? rolled;
  return { overall: r2(Math.min(wear, centering)), wear, centering, corners, edges, surface };
}

export function rollCondition(rng: Rng): Condition {
  const b = rng.weighted(CONFIG.condition.distribution);
  return conditionFromWear(rng, rng.range(b.range[0], b.range[1]));
}

export function tierOf(wear: number) {
  return CONFIG.condition.tiers.find((t) => wear >= t.min) ?? CONFIG.condition.tiers[4];
}
export function tierId(wear: number): TierId {
  return tierOf(wear).id as TierId;
}

/** Worst-axis border split for a centering score: 9.5 -> 55/45, 8.5 -> 60/40, 7.5 -> 65/35. */
export function centeringPct(score: number): number {
  return score >= 9.5 ? 50 + (10 - score) * 10 : Math.min(90, 55 + (9.5 - score) * 5);
}

// ---------------------------------------------------------------------------
// Flaw geometry. Pure data in card units (250 x 350); the UI only draws it.
// ---------------------------------------------------------------------------

export const CARD_W = 250;
export const CARD_H = 350;
export const CARD_R = 11;
/** Total border on each axis; centering splits it between the two sides. */
export const BORDER_TOTAL = 28;

type Pt = [number, number];
export interface Blob { x: number; y: number; rx: number; ry: number; rot: number; front: boolean }
export interface Line { x1: number; y1: number; x2: number; y2: number; w: number; o: number; back: boolean }
export interface Scuff { x: number; y: number; rx: number; ry: number; rot: number; o: number; back: boolean }
export interface Crease { pts: Pt[]; w: number }
export interface Flaws {
  /** Percent of the border on the left / top side (50 = perfectly centered). */
  centering: { left: number; top: number };
  whitening: Blob[];
  scratches: Line[];
  scuffs: Scuff[];
  creases: Crease[];
  tears: Pt[][];
  stains: Blob[];
}

type Anchor = (typeof CONFIG.flaws.anchors)[number];
/** Interpolate a flaw amount for a sub-score from the anchor table. */
function at(score: number, key: keyof Anchor): number {
  const A = CONFIG.flaws.anchors;
  for (let i = 0; i < A.length - 1; i++) {
    const hi = A[i], lo = A[i + 1];
    if (score >= lo.cond) {
      const t = clamp((hi.cond - score) / (hi.cond - lo.cond), 0, 1);
      return hi[key] + (lo[key] - hi[key]) * t;
    }
  }
  return A[A.length - 1][key];
}

export function generateFlaws(card: CardInstance): Flaws {
  const rng = new Rng(hashSeed('flaws', card.seed));
  const { cond } = card;
  /** 2.4 -> 2, plus a 40% chance of a third. */
  const count = (x: number) => Math.floor(x) + (rng.chance(x - Math.floor(x)) ? 1 : 0);

  // Some cards took their wear face-down: the front looks clean and the back tells the truth.
  const F = CONFIG.flaws;
  const bh = rng.chance(F.backHeavyChance) ? 1 : 0;

  const worst = centeringPct(cond.centering);
  const other = rng.range(50, worst);
  const sign = () => (rng.chance(0.5) ? 1 : -1);
  const [h, v] = rng.chance(0.5) ? [worst, other] : [other, worst];
  const centering = { left: 50 + (h - 50) * sign(), top: 50 + (v - 50) * sign() };

  const whitening: Blob[] = [];

  // Corners: dots and chips sitting on the rounded corner arc.
  const cornerAt: [number, number, number][] = [
    [CARD_R, CARD_R, 180],
    [CARD_W - CARD_R, CARD_R, 270],
    [CARD_W - CARD_R, CARD_H - CARD_R, 0],
    [CARD_R, CARD_H - CARD_R, 90],
  ];
  const cSize = at(cond.corners, 'cornerSize');
  for (let k = count(at(cond.corners, 'cornerBlobs')); k > 0; k--) {
    const [cx, cy, start] = rng.pick(cornerAt);
    const a = ((start + rng.range(5, 85)) * Math.PI) / 180;
    const r = cSize * rng.range(0.6, 1.3);
    whitening.push({
      x: cx + Math.cos(a) * (CARD_R - rng.range(0, 0.6)),
      y: cy + Math.sin(a) * (CARD_R - rng.range(0, 0.6)),
      rx: r, ry: r * rng.range(0.6, 1), rot: rng.range(0, 180),
      front: r > F.frontWhiteningSize.corner[bh] || rng.chance(F.frontShare.whitening[bh]),
    });
  }

  // Edges: whitening nicks hugging the card edge; long ones merge into worn stretches.
  const nLen = at(cond.edges, 'nickLen'), nDepth = at(cond.edges, 'nickDepth');
  for (let k = count(at(cond.edges, 'nicks')); k > 0; k--) {
    const edge = rng.int(0, 3);
    const len = nLen * rng.range(0.4, 1.2);
    const depth = nDepth * rng.range(0.7, 1.2);
    const horiz = edge % 2 === 0;
    const t = rng.range(CARD_R, (horiz ? CARD_W : CARD_H) - CARD_R);
    whitening.push({
      x: horiz ? t : edge === 1 ? CARD_W : 0,
      y: horiz ? (edge === 0 ? 0 : CARD_H) : t,
      rx: horiz ? len / 2 : depth, ry: horiz ? depth : len / 2, rot: 0,
      front: depth > F.frontWhiteningSize.edge[bh] || rng.chance(F.frontShare.whitening[bh]),
    });
  }

  // Surface: scratches, hazy scuffs, then creases from Moderately Played down.
  const spot = (m: number): Pt => [rng.range(m, CARD_W - m), rng.range(m, CARD_H - m)];
  const scratches: Line[] = [];
  const sLen = at(cond.surface, 'scratchLen'), sOp = at(cond.surface, 'scratchOp');
  for (let k = count(at(cond.surface, 'scratches')); k > 0; k--) {
    const len = sLen * rng.range(0.4, 1.3);
    const a = rng.range(0, Math.PI);
    const [x, y] = spot(24);
    const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2;
    const o = Math.min(0.85, sOp * rng.range(0.8, 1.2));
    scratches.push({ x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy, w: 0.25 + o * 0.9, o, back: !rng.chance(F.frontShare.scratch[bh]) });
  }
  const scuffs: Scuff[] = [];
  for (let k = count(at(cond.surface, 'scuffs')); k > 0; k--) {
    const [x, y] = spot(28);
    const rx = rng.range(6, 16);
    scuffs.push({ x, y, rx, ry: rx * rng.range(0.4, 0.9), rot: rng.range(0, 180), o: rng.range(0.25, 0.5), back: !rng.chance(F.frontShare.scuff[bh]) });
  }
  const crease = (len: number, w: number): Crease => {
    const a = rng.range(0, Math.PI);
    const [x, y] = spot(30);
    const pts: Pt[] = [];
    for (let j = 0; j <= 3; j++) {
      const t = j / 3 - 0.5;
      pts.push([x + Math.cos(a) * len * t + rng.range(-2, 2), y + Math.sin(a) * len * t + rng.range(-2, 2)]);
    }
    return { pts, w };
  };
  const creases: Crease[] = [];
  const tier = tierId(cond.wear);
  const small = count(at(cond.surface, 'creases'));
  for (let k = small; k > 0; k--) creases.push(crease(rng.range(15, 45), 0.9));

  // Damaged: structural problems no other tier has.
  const tears: Pt[][] = [];
  const stains: Blob[] = [];
  if (tier === 'DMG') {
    for (let k = 1 + count((2.5 - cond.wear) * 1.2); k > 0; k--) {
      const kind = rng.weighted(CONFIG.flaws.structural).id;
      if (kind === 'bigCrease') creases.push(crease(rng.range(110, 240), 1.7));
      else if (kind === 'tear') {
        const edge = rng.int(0, 3), horiz = edge % 2 === 0;
        const t = rng.range(30, (horiz ? CARD_W : CARD_H) - 30);
        const depth = rng.range(14, 42) * (edge === 0 || edge === 3 ? 1 : -1);
        const base = edge === 0 || edge === 3 ? 0 : horiz ? CARD_H : CARD_W;
        const w = rng.range(2, 4.5), skew = rng.range(-10, 10);
        const raw: Pt[] = [[t - w, base], [t + skew * 0.4, base + depth * 0.55], [t + skew, base + depth], [t + skew * 0.6 + w * 0.5, base + depth * 0.5], [t + w, base]];
        tears.push(horiz ? raw : raw.map(([a, b]) => [b, a] as Pt));
      } else {
        const [x, y] = spot(40);
        for (let j = rng.int(2, 3); j > 0; j--) {
          const rx = rng.range(16, 38);
          stains.push({ x: x + rng.range(-14, 14), y: y + rng.range(-14, 14), rx, ry: rx * rng.range(0.6, 1), rot: rng.range(0, 180), front: true });
        }
      }
    }
  }

  return { centering, whitening, scratches, scuffs, creases, tears, stains };
}
