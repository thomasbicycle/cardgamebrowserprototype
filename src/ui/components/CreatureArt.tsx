import type { Element } from '../../core/cards';
import { Rng, hashSeed } from '../../core/rng';

export const PALETTE: Record<Element, [string, string, string]> = {
  ember: ['#ffc9a8', '#f0703c', '#8f2f12'],
  tide: ['#b9e0ff', '#3f8fdc', '#174a85'],
  moss: ['#cdeeb0', '#5cab45', '#2a5e22'],
  volt: ['#fff3ad', '#e6b422', '#7d5c08'],
  stone: ['#e6d6c0', '#a08363', '#57422d'],
  gale: ['#dff6f2', '#6cc0b4', '#2a6c63'],
  frost: ['#eaf7ff', '#7db8e2', '#2f6690'],
  dusk: ['#d6c8f0', '#7352b4', '#35215f'],
};

/** Placeholder creature: a procedural blob monster in a 200 x 150 box, fixed per card id. */
export function CreatureArt({ id, element }: { id: string; element: Element }) {
  const r = new Rng(hashSeed('art', id));
  const [light, mid, dark] = PALETTE[element];
  const cx = 100, cy = 84;
  const bw = r.range(36, 54), bh = r.range(34, 48);

  const n = 10;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + r.range(-0.1, 0.1);
    return [cx + Math.cos(a) * bw * k, cy + Math.sin(a) * bh * k];
  });
  const m = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s0 = m(pts[0], pts[1]);
  let body = `M${s0[0]},${s0[1]}`;
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n], q = m(p, pts[(i + 1) % n]);
    body += `Q${p[0]},${p[1]} ${q[0]},${q[1]}`;
  }

  const top = r.int(0, 4);
  const eyes = r.pick([1, 2, 2, 2, 3]);
  const eyeR = r.range(5, 8);
  const eyeY = cy - bh * 0.18;
  const gap = bw * 0.42;
  const eyeXs = eyes === 1 ? [cx] : eyes === 2 ? [cx - gap, cx + gap] : [cx - gap, cx, cx + gap];
  const fangs = r.chance(0.4);
  const tail = r.chance(0.6);
  const wings = r.chance(0.35);
  const ty = cy - bh * 0.85;

  return (
    <g stroke={dark} stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
      {tail && <path d={`M${cx + bw * 0.8},${cy + bh * 0.4} q${bw * 0.7},-4 ${bw * 0.6},-${bh * 0.9}`} fill="none" stroke-width="7" stroke={mid} />}
      {wings && [-1, 1].map((d) => (
        <path d={`M${cx + d * bw * 0.7},${cy - 6} l${d * 34},-22 l${-d * 4},18 l${d * 6},10 z`} fill={light} />
      ))}
      {top === 0 && [-1, 1].map((d) => <path d={`M${cx + d * bw * 0.5},${ty + 6} l${d * 6},-24 l${d * 9},22 z`} fill={light} />)}
      {top === 1 && [-1, 1].map((d) => <circle cx={cx + d * bw * 0.6} cy={ty + 2} r="11" fill={mid} />)}
      {top === 2 && <path d={`M${cx},${ty + 6} q-4,-16 -20,-18 q8,14 20,18 q2,-18 18,-22 q-4,16 -18,22`} fill="#6fbf4a" />}
      {top === 3 && [-1, 1].map((d) => (
        <g>
          <path d={`M${cx + d * 10},${ty + 6} q${d * 6},-18 ${d * 16},-24`} fill="none" />
          <circle cx={cx + d * 26} cy={ty - 18} r="4" fill={light} />
        </g>
      ))}
      {top === 4 && [-16, 0, 16].map((d) => <path d={`M${cx + d - 7},${ty + 8} l7,-${d === 0 ? 22 : 15} l7,${d === 0 ? 22 : 15} z`} fill={dark} />)}
      {[-1, 1].map((d) => <ellipse cx={cx + d * bw * 0.45} cy={cy + bh * 0.95} rx="11" ry="6" fill={mid} />)}
      <path d={body} fill={mid} />
      <ellipse cx={cx} cy={cy + bh * 0.42} rx={bw * 0.5} ry={bh * 0.36} fill={light} stroke="none" opacity="0.75" />
      {eyeXs.map((x) => (
        <g stroke="none">
          <circle cx={x} cy={eyeY} r={eyeR} fill="#fff" stroke={dark} stroke-width="1.5" />
          <circle cx={x + 1} cy={eyeY + 1} r={eyeR * 0.5} fill="#1b1b22" />
          <circle cx={x - 1} cy={eyeY - 1.5} r={eyeR * 0.2} fill="#fff" />
        </g>
      ))}
      <path d={`M${cx - 8},${cy + bh * 0.2} q8,7 16,0`} fill="none" />
      {fangs && [-5, 5].map((d) => <path d={`M${cx + d - 2},${cy + bh * 0.2 + 2} l2,5 l2,-5`} fill="#fff" stroke-width="1" />)}
    </g>
  );
}
