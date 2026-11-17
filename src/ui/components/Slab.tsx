import { CONFIG } from '../../config';
import { cardDef, cardNumber } from '../../core/cards';
import { CARD_H, CARD_W, type CardInstance } from '../../core/condition';
import type { Slab } from '../../core/game';
import { CardView } from './CardView';

/** Slab outline in card units: the card sits at 0,0 with the label above it. */
export const SLAB = { x: -16, y: -84, w: CARD_W + 32, h: CARD_H + 100 };
const LW = SLAB.w - 20;

export const companyOf = (id: string) => CONFIG.grading.companies.find((c) => c.id === id)!;

/** A graded card in its plastic case. Vector like the card, so it zooms cleanly. */
export function SlabView({ card, slab, side, viewBox }: { card: CardInstance; slab: Slab; side: 'front' | 'back'; viewBox?: string }) {
  const co = companyOf(slab.company);
  const L = co.label;
  const def = cardDef(card.cardId);
  const bars = Array.from({ length: 34 }, (_, i) => ((slab.cert >> (i % 24)) & 1 ? 2.2 : 1.1));
  return (
    <svg viewBox={viewBox ?? `${SLAB.x} ${SLAB.y} ${SLAB.w} ${SLAB.h}`} class="card-svg" preserveAspectRatio="xMidYMid meet">
      <rect x={SLAB.x} y={SLAB.y} width={SLAB.w} height={SLAB.h} rx="14" fill="#c8d4e8" fill-opacity="0.14" stroke="#e8eef8" stroke-opacity="0.65" stroke-width="2.5" />
      <rect x={SLAB.x + 5} y={SLAB.y + 5} width={SLAB.w - 10} height={SLAB.h - 10} rx="10" fill="none" stroke="#fff" stroke-opacity="0.18" />
      <g transform={`translate(${SLAB.x + 10},${SLAB.y + 10})`}>
        <rect width={LW} height="62" rx="5" fill={L.bg} stroke={L.accent} stroke-width="3" />
        {side === 'front' ? (
          <>
            <text x="10" y="22" font-size="18" font-weight="900" fill={L.accent} letter-spacing="1">{co.name}</text>
            <text x="10" y="37" font-size="9.5" font-weight="800" fill={L.fg}>{def.name.toUpperCase()} {cardNumber(def)}</text>
            <text x="10" y="48" font-size="7.5" fill={L.fg}>WILDKIN · FIRST BLOOM</text>
            <text x="10" y="57" font-size="7" fill={L.fg} opacity="0.7">#{slab.cert}</text>
            <text x={LW - 10} y="18" text-anchor="end" font-size="8.5" font-weight="800" fill={L.fg}>{CONFIG.grading.gradeNames[slab.grade]}</text>
            <text x={LW - 10} y="53" text-anchor="end" font-size="34" font-weight="900" fill={L.fg}>{slab.grade}</text>
          </>
        ) : (
          <>
            <g transform="translate(12,12)">{bars.map((w, i) => <rect x={i * 3.4} width={w} height="26" fill={L.fg} />)}</g>
            <text x="12" y="52" font-size="8" fill={L.fg}>#{slab.cert}</text>
            <circle cx={LW - 34} cy="31" r="20" fill={L.accent} opacity="0.85" />
            <text x={LW - 34} y="35" text-anchor="middle" font-size="10" font-weight="900" fill={L.bg}>{co.name}</text>
          </>
        )}
      </g>
      <rect x="-6" y="-6" width={CARD_W + 12} height={CARD_H + 12} rx="15" fill="#05070c" fill-opacity="0.45" stroke="#fff" stroke-opacity="0.25" />
      <CardView card={card} side={side} nested />
      <path d={`M${SLAB.x + 4} ${SLAB.y + 90} L${SLAB.x + 110} ${SLAB.y + 4} L${SLAB.x + 150} ${SLAB.y + 4} L${SLAB.x + 4} ${SLAB.y + 140} Z`} fill="#fff" opacity="0.07" />
    </svg>
  );
}
