import { CONFIG, type TierId } from '../config';
import { Rng, hashSeed } from './rng';

/** Hidden true condition. Each sub-score is 1-10; overall is the worst of them. */
export interface Condition {
  overall: number;
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

export function conditionFromOverall(rng: Rng, overall: number): Condition {
  const c = Math.min(10, Math.max(1, overall));
  const wear = ['corners', 'edges', 'surface'] as const;
  // Centering alone can drag a card down to Lightly Played, never further.
  const pool = c >= 6 ? (['centering', ...wear] as const) : wear;
  const limiting = new Set<string>([rng.pick(pool)]);
  if (rng.chance(0.4)) limiting.add(rng.pick(pool));
  // Beat-up cards are worn everywhere, so other attributes stay closer to the worst one.
  const spread = c >= 6 ? 0.8 : 0.6;
  const sub = (k: string) =>
    limiting.has(k) ? c : r2(c + (10 - c) * Math.pow(rng.next(), 1.5) * spread);
  const cond = {
    centering: c >= 6 ? sub('centering') : r2(rng.range(6, 10)),
    corners: sub('corners'),
    edges: sub('edges'),
    surface: sub('surface'),
  };
  return { overall: r2(Math.min(cond.centering, cond.corners, cond.edges, cond.surface)), ...cond };
}

export function rollCondition(rng: Rng): Condition {
  const b = rng.weighted(CONFIG.condition.distribution);
  return conditionFromOverall(rng, r2(rng.range(b.range[0], b.range[1])));
}

export function tierOf(overall: number) {
  return CONFIG.condition.tiers.find((t) => overall >= t.min) ?? CONFIG.condition.tiers[4];
}
export function tierId(overall: number): TierId {
  return tierOf(overall).id as TierId;
}

// ---------------------------------------------------------------------------
// Flaw geometry. Pure data in card units (250 x 350); the UI only draws it.
// ---------------------------------------------------------------------------

export const CARD_W = 250;
export const CARD_H = 350;
export const CARD_R = 11;
/** Total border on each axis; centering splits it between the two sides. */
export const BORDER_TOTAL = 28;

export interface Blob { x: number; y: number; rx: number; ry: number; rot: number; front: boolean }
export interface Line { x1: number; y1: number; x2: number; y2: number; w: number; o: number; back: boolean }
export interface Crease { pts: [number, number][]; w: number }
export interface Flaws {
  /** Percent of the border on the left / top side (50 = perfectly centered). */
  centering: { left: number; top: number };
  whitening: Blob[];
  scratches: Line[];
  creases: Crease[];
}

export function generateFlaws(card: CardInstance): Flaws {
  const rng = new Rng(hashSeed('flaws', card.seed));
  const { cond } = card;
  const sev = (s: number) => Math.max(0, (10 - s) / 9);

  // Centering: 10 -> ~50/50, 9 -> ~55/45, 8 -> ~60/40, 7 -> ~65/35 ...
  const worst = Math.min(88, 50 + (10 - cond.centering) * 4.5 + rng.range(0, 2));
  const other = rng.range(50, worst);
  const flip = () => (rng.chance(0.5) ? 1 : -1);
  const [h, v] = rng.chance(0.5) ? [worst, other] : [other, worst];
  const centering = { left: 50 + (h - 50) * flip(), top: 50 + (v - 50) * flip() };

  const whitening: Blob[] = [];

  // Corners: dots and chips sitting on the rounded corner arc.
  const cv = sev(cond.corners);
  const corners: [number, number, number][] = [
    [CARD_R, CARD_R, 180],
    [CARD_W - CARD_R, CARD_R, 270],
    [CARD_W - CARD_R, CARD_H - CARD_R, 0],
    [CARD_R, CARD_H - CARD_R, 90],
  ];
  const worn = corners.map(() => rng.chance(Math.min(1, cv * 3.5)));
  if (cond.corners < 9.6 && !worn.includes(true)) worn[rng.int(0, 3)] = true;
  corners.forEach(([cx, cy, start], i) => {
    if (!worn[i]) return;
    const n = 1 + Math.floor(cv * 6 * rng.range(0.6, 1.2));
    for (let k = 0; k < n; k++) {
      const a = ((start + rng.range(5, 85)) * Math.PI) / 180;
      const r = (0.5 + cv * 5) * rng.range(0.6, 1.3);
      whitening.push({
        x: cx + Math.cos(a) * (CARD_R - rng.range(0, 0.6)),
        y: cy + Math.sin(a) * (CARD_R - rng.range(0, 0.6)),
        rx: r, ry: r * rng.range(0.6, 1), rot: rng.range(0, 180),
        front: r > 2.2 || rng.chance(0.3),
      });
    }
  });

  // Edges: nicks hugging the card edge.
  const ev = sev(cond.edges);
  const nicks = Math.round(Math.pow(ev, 1.2) * 60 + (cond.edges < 9.8 ? rng.range(0, 1.5) : 0));
  for (let k = 0; k < nicks; k++) {
    const edge = rng.int(0, 3);
    const len = 0.8 + ev * rng.range(1, 10);
    const depth = (0.4 + ev * 2.2) * rng.range(0.7, 1.2);
    const horiz = edge % 2 === 0;
    const t = rng.range(CARD_R, (horiz ? CARD_W : CARD_H) - CARD_R);
    whitening.push({
      x: horiz ? t : edge === 1 ? CARD_W : 0,
      y: horiz ? (edge === 0 ? 0 : CARD_H) : t,
      rx: horiz ? len / 2 : depth, ry: horiz ? depth : len / 2, rot: 0,
      front: depth > 1.6 || rng.chance(0.3),
    });
  }

  // Surface: fine scratches, then creases once the card is Heavily Played or worse.
  const sv = sev(cond.surface);
  const scratches: Line[] = [];
  const count = Math.round(sv * 14 + (cond.surface < 9.7 ? rng.range(0, 1) : 0));
  for (let k = 0; k < count; k++) {
    const len = 8 + sv * rng.range(10, 120);
    const a = rng.range(0, Math.PI);
    const x = rng.range(24, CARD_W - 24);
    const y = rng.range(24, CARD_H - 24);
    const dx = (Math.cos(a) * len) / 2;
    const dy = (Math.sin(a) * len) / 2;
    scratches.push({
      x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy,
      w: 0.3 + sv * 0.7 * rng.range(0.6, 1.2),
      o: Math.min(0.8, 0.2 + sv * 0.5 * rng.range(0.7, 1.3)),
      back: rng.chance(0.25),
    });
  }
  const creases: Crease[] = [];
  if (cond.surface < 4.5) {
    const big = cond.surface < 2.5;
    const n = 1 + Math.floor((4.5 - cond.surface) / 1.5);
    for (let k = 0; k < n; k++) {
      const len = big ? rng.range(90, 220) : rng.range(18, 50);
      const a = rng.range(0, Math.PI);
      const x = rng.range(30, CARD_W - 30);
      const y = rng.range(30, CARD_H - 30);
      const pts: [number, number][] = [];
      for (let j = 0; j <= 3; j++) {
        const t = j / 3 - 0.5;
        pts.push([x + Math.cos(a) * len * t + rng.range(-2, 2), y + Math.sin(a) * len * t + rng.range(-2, 2)]);
      }
      creases.push({ pts, w: big ? 1.6 : 0.9 });
    }
  }

  return { centering, whitening, scratches, creases };
}
