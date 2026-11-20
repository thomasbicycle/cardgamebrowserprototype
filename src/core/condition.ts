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
  const room = Math.min(10 - wear, maxSpread(wear));
  const sub = (k: string) => (limiting.has(k) ? wear : r2(wear + room * Math.pow(rng.next(), 1.5)));
  const corners = sub('corners'), edges = sub('edges'), surface = sub('surface');
  const rolled = r2(clamp(10 - Math.abs(rng.normal()) * C.centering.sd, C.centering.min, 10));
  const centering = centeringScore ?? rolled;
  return { overall: r2(Math.min(wear, centering)), wear, centering, corners, edges, surface };
}

/** How far the better sub-scores may sit above the worst one. */
export function maxSpread(wear: number): number {
  const S = CONFIG.condition.spread;
  return S.base + Math.max(0, 8 - wear) * S.perPointBelow8;
}

/** Pick a raw tier by its configured share, then a wear score evenly inside that tier. */
export function rollCondition(rng: Rng): Condition {
  const T = CONFIG.condition.tiers;
  const t = rng.weighted(T.map((x, k) => ({ k, w: CONFIG.condition.distribution[x.id as TierId] }))).k;
  const lo = Math.max(1, T[t].min), hi = t === 0 ? 10 : T[t - 1].min - 0.01;
  return conditionFromWear(rng, rng.range(lo, hi));
}

export function tierOf(wear: number) {
  return CONFIG.condition.tiers.find((t) => wear >= t.min) ?? CONFIG.condition.tiers[4];
}
export function tierId(wear: number): TierId {
  return tierOf(wear).id as TierId;
}

/**
 * Marks a card at this wear score has (front and back together). Each tier has its own range
 * (NM 0-2, LP 3-4, ...) and a more worn card sits higher in it. Ranges never overlap.
 */
export function marksFor(wear: number): number {
  const T = CONFIG.condition.tiers;
  const i = T.indexOf(tierOf(wear));
  const top = i === 0 ? 10 : T[i - 1].min, bottom = Math.max(1, T[i].min);
  const [lo, hi] = CONFIG.condition.marks[T[i].id as TierId];
  const p = Math.min(1, Math.max(0, (top - wear) / (top - bottom)));
  return lo + Math.min(hi - lo, Math.floor(p * (hi - lo + 1)));
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

  // The tier fixes how many marks the card has (whitening, scratches, scuffs; both sides together),
  // so counting marks always gives the right condition. They are shared out by how worn each part is,
  // and the worst part always gets the first one.
  const tier = tierId(cond.wear);
  const total = marksFor(cond.wear);
  const parts = [['corners', cond.corners], ['edges', cond.edges], ['surface', cond.surface]] as const;
  const worstPart = parts.reduce((x, y) => (y[1] < x[1] ? y : x))[0];
  const share = parts.map(([k, sc]) => ({ k, w: Math.pow(10.5 - sc, 2) }));
  const plan = { corners: 0, edges: 0, surface: 0 };
  for (let i = 0; i < total; i++) plan[i === 0 ? worstPart : rng.weighted(share).k]++;
  // Four corners only fit so many separate dots; on lighter cards the rest go to the edges.
  const light = tier === 'NM' || tier === 'LP' || tier === 'MP';
  if (light && plan.corners > F.maxCornerMarks) { plan.edges += plan.corners - F.maxCornerMarks; plan.corners = F.maxCornerMarks; }

  // Marks on a lightly worn card never overlap, so each one can be seen and counted.
  const taken: Pt[] = [];
  const place = (make: () => Pt): Pt => {
    let p = make();
    for (let tries = 0; tries < 60 && taken.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < F.minGap); tries++) p = make();
    taken.push(p);
    return p;
  };

  const whitening: Blob[] = [];

  // Corners: dots and chips sitting on the rounded corner arc.
  const cornerAt: [number, number, number][] = [
    [CARD_R, CARD_R, 180],
    [CARD_W - CARD_R, CARD_R, 270],
    [CARD_W - CARD_R, CARD_H - CARD_R, 0],
    [CARD_R, CARD_H - CARD_R, 90],
  ];
  const cSize = at(cond.corners, 'cornerSize');
  // Each corner gets one mark before any corner gets a second.
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  for (let k = 0; k < plan.corners; k++) {
    const r = cSize * rng.range(0.85, 1.25);
    const [x, y] = place(() => {
      const [cx, cy, start] = cornerAt[order[k % 4]];
      const a = ((start + rng.range(15, 75)) * Math.PI) / 180;
      // Sit mostly on the card, not off the rounded edge, so it can be seen.
      const d = CARD_R - r * 0.45;
      return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
    });
    whitening.push({
      x, y, rx: r, ry: r * rng.range(0.7, 1), rot: rng.range(0, 180),
      front: r > F.frontWhiteningSize.corner[bh] || rng.chance(F.frontShare.whitening[bh]),
    });
  }

  // Edges: whitening nicks hugging the card edge; long ones read as worn stretches.
  const nLen = at(cond.edges, 'nickLen'), nDepth = at(cond.edges, 'nickDepth');
  for (let k = plan.edges; k > 0; k--) {
    const len = nLen * rng.range(0.8, 1.25);
    const depth = nDepth * rng.range(0.85, 1.15);
    let horiz = true;
    const [x, y] = place(() => {
      const edge = rng.int(0, 3);
      horiz = edge % 2 === 0;
      const t = rng.range(CARD_R + 4, (horiz ? CARD_W : CARD_H) - CARD_R - 4);
      const inset = depth * 0.35;
      return [horiz ? t : edge === 1 ? CARD_W - inset : inset, horiz ? (edge === 0 ? inset : CARD_H - inset) : t];
    });
    whitening.push({
      x, y, rx: horiz ? len / 2 : depth, ry: horiz ? depth : len / 2, rot: 0,
      front: depth > F.frontWhiteningSize.edge[bh] || rng.chance(F.frontShare.whitening[bh]),
    });
  }

  // Surface: scratches and hazy scuffs, then creases from Heavily Played down.
  const spot = (m: number): Pt => [rng.range(m, CARD_W - m), rng.range(m, CARD_H - m)];
  const scratches: Line[] = [];
  const scuffs: Scuff[] = [];
  const sLen = at(cond.surface, 'scratchLen'), sOp = at(cond.surface, 'scratchOp');
  for (let k = plan.surface; k > 0; k--) {
    if (rng.chance(F.scuffShare)) {
      const [x, y] = place(() => spot(28));
      const rx = rng.range(6, 14);
      scuffs.push({ x, y, rx, ry: rx * rng.range(0.5, 0.9), rot: rng.range(0, 180), o: rng.range(0.35, 0.55), back: !rng.chance(F.frontShare.scuff[bh]) });
    } else {
      const len = sLen * rng.range(0.75, 1.3);
      const a = rng.range(0, Math.PI);
      const [x, y] = place(() => spot(24));
      const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2;
      const o = Math.min(0.85, sOp * rng.range(0.9, 1.15));
      scratches.push({ x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy, w: 0.3 + o * 0.9, o, back: !rng.chance(F.frontShare.scratch[bh]) });
    }
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
  const SC = F.smallCrease;
  const small = tier === 'HP' || tier === 'DMG' ? Math.min(count(at(cond.surface, 'creases')), tier === 'DMG' ? Infinity : SC.maxHP) : 0;
  for (let k = small; k > 0; k--) creases.push(crease(rng.range(SC.len[0], SC.len[1]), 0.9));

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
