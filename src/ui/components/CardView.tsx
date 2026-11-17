import { useMemo } from 'preact/hooks';
import { CONFIG } from '../../config';
import { cardDef, cardNumber } from '../../core/cards';
import { BORDER_TOTAL, CARD_H, CARD_R, CARD_W, generateFlaws, type CardInstance } from '../../core/condition';
import { CreatureArt, PALETTE } from './CreatureArt';

const IW = CARD_W - BORDER_TOTAL;
const IH = CARD_H - BORDER_TOTAL;
const WHITE = '#f3efe2';

interface Props {
  card: CardInstance;
  side: 'front' | 'back';
  viewBox?: string;
  /** Draw inside a parent SVG (e.g. a slab) at 0,0 in card units instead of as its own element. */
  nested?: boolean;
}

/** Draws one physical card, flaws included. Everything is vector so it stays sharp when zoomed. */
export function CardView({ card, side, viewBox, nested }: Props) {
  const def = cardDef(card.cardId);
  const flaws = useMemo(() => generateFlaws(card), [card.seed]);
  const [light, mid, dark] = PALETTE[def.element];
  const rarity = CONFIG.rarities[def.rarity];
  const back = side === 'back';
  const id = `c${card.uid}${side}`;
  // The back is the same sheet seen from behind, so horizontal positions mirror.
  const mx = (x: number) => (back ? CARD_W - x : x);
  const left = (BORDER_TOTAL * (back ? 100 - flaws.centering.left : flaws.centering.left)) / 100;
  const top = (BORDER_TOTAL * flaws.centering.top) / 100;
  const holo = def.rarity === 'rare' || def.rarity === 'ultra';

  return (
    <svg
      viewBox={viewBox ?? `0 0 ${CARD_W} ${CARD_H}`}
      {...(nested ? { width: CARD_W, height: CARD_H, overflow: 'visible' } : { class: 'card-svg', preserveAspectRatio: 'xMidYMid meet' })}
    >
      <defs>
        <clipPath id={`${id}clip`}><rect width={CARD_W} height={CARD_H} rx={CARD_R} /></clipPath>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={light} /><stop offset="1" stop-color={mid} />
        </linearGradient>
        <linearGradient id={`${id}holo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff9ad5" /><stop offset="0.35" stop-color="#9ad7ff" />
          <stop offset="0.7" stop-color="#b6ffb0" /><stop offset="1" stop-color="#ffe89a" />
        </linearGradient>
        <radialGradient id={`${id}scuff`}>
          <stop offset="0" stop-color="#fff" stop-opacity="0.9" /><stop offset="0.6" stop-color="#fff" stop-opacity="0.5" /><stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <radialGradient id={`${id}stain`}>
          <stop offset="0" stop-color="#5a3d14" stop-opacity="0.5" /><stop offset="0.75" stop-color="#5a3d14" stop-opacity="0.4" />
          <stop offset="0.9" stop-color="#3d2808" stop-opacity="0.55" /><stop offset="1" stop-color="#3d2808" stop-opacity="0" />
        </radialGradient>
        <pattern id={`${id}pat`} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="18" height="18" fill="#27408f" /><rect width="9" height="9" fill="#2e4aa3" /><rect x="9" y="9" width="9" height="9" fill="#2e4aa3" />
        </pattern>
      </defs>
      <rect x="1.5" y="2.5" width={CARD_W} height={CARD_H} rx={CARD_R} fill="#000" opacity="0.35" />
      <g clip-path={`url(#${id}clip)`}>
        <rect width={CARD_W} height={CARD_H} fill={back ? '#16224f' : '#262c44'} />
        {back ? (
          <g transform={`translate(${left},${top})`}>
            <rect width={IW} height={IH} rx="6" fill={`url(#${id}pat)`} />
            <rect x="6" y="6" width={IW - 12} height={IH - 12} rx="4" fill="none" stroke="#8fa6ee" stroke-width="1.5" />
            <ellipse cx={IW / 2} cy={IH / 2} rx="78" ry="46" fill="#16224f" stroke="#ffd866" stroke-width="3" />
            <text x={IW / 2} y={IH / 2 + 9} text-anchor="middle" font-size="27" font-weight="900" fill="#ffd866" letter-spacing="2">WILDKIN</text>
          </g>
        ) : (
          <g transform={`translate(${left},${top})`}>
            <rect width={IW} height={IH} rx="6" fill={`url(#${id}bg)`} />
            <text x="10" y="23" font-size="16" font-weight="800" fill="#1b1b22">{def.name}</text>
            <text x={IW - 10} y="23" text-anchor="end" font-size="12" font-weight="700" fill={dark}>PWR {def.power}</text>
            <rect x="10" y="31" width={IW - 20} height="152" rx="4" fill={holo ? `url(#${id}holo)` : '#fff'} opacity={holo ? 0.85 : 0.5} />
            <rect x="10" y="31" width={IW - 20} height="152" rx="4" fill="none" stroke={dark} stroke-width="2" />
            <g transform="translate(11,32)"><CreatureArt id={def.id} element={def.element} /></g>
            <rect x="10" y="189" width={IW - 20} height="14" rx="3" fill={dark} />
            <text x={IW / 2} y="199.500" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff" letter-spacing="1">
              {def.element.toUpperCase()} WILDKIN
            </text>
            <rect x="10" y="209" width={IW - 20} height="84" rx="4" fill="#fff" opacity="0.6" />
            <text x="18" y="232" font-size="14" font-weight="800" fill="#1b1b22">{def.move}</text>
            <text x={IW - 18} y="232" text-anchor="end" font-size="14" font-weight="800" fill="#1b1b22">{Math.round(def.power * 0.6)}</text>
            <text x="18" y="254" font-size="8.5" fill="#333">A {def.element} wildkin often seen at the</text>
            <text x="18" y="266" font-size="8.5" fill="#333">edge of the bloom. Handle with care.</text>
            <text x="10" y={IH - 9} font-size="9" font-weight="700" fill="#1b1b22">{cardNumber(def)}</text>
            <text x={IW / 2} y={IH - 9} text-anchor="middle" font-size="6.5" fill="#333">© WILDKIN · FIRST BLOOM</text>
            <text x={IW - 10} y={IH - 8} text-anchor="end" font-size="12" fill="#1b1b22">{rarity.symbol}</text>
          </g>
        )}
        {flaws.stains.map((b) => (
          <ellipse cx={mx(b.x)} cy={b.y} rx={b.rx} ry={b.ry} fill={`url(#${id}stain)`} transform={`rotate(${b.rot} ${mx(b.x)} ${b.y})`} />
        ))}
        {flaws.scuffs.filter((s) => s.back === back).map((s) => (
          <ellipse cx={mx(s.x)} cy={s.y} rx={s.rx} ry={s.ry} fill={`url(#${id}scuff)`} opacity={s.o} transform={`rotate(${s.rot} ${mx(s.x)} ${s.y})`} />
        ))}
        {flaws.scratches.filter((s) => s.back === back).map((s) => (
          <line x1={mx(s.x1)} y1={s.y1} x2={mx(s.x2)} y2={s.y2} stroke="#fff" stroke-width={s.w} stroke-opacity={s.o} stroke-linecap="round" />
        ))}
        {flaws.creases.map((c) => {
          const d = 'M' + c.pts.map(([x, y]) => `${mx(x)},${y}`).join('L');
          return (
            <g fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d={d} stroke="#000" stroke-opacity="0.45" stroke-width={c.w * 1.6} transform="translate(0.7,0.7)" />
              <path d={d} stroke={WHITE} stroke-opacity="0.9" stroke-width={c.w} />
            </g>
          );
        })}
        {flaws.tears.map((t) => (
          <g stroke-linejoin="round">
            <path d={'M' + t.map(([x, y]) => `${mx(x)},${y}`).join('L') + 'Z'} fill={WHITE} stroke="#000" stroke-opacity="0.55" stroke-width="0.6" />
            <path d={`M${mx((t[0][0] + t[4][0]) / 2)},${(t[0][1] + t[4][1]) / 2}L${mx(t[2][0])},${t[2][1]}`} stroke="#0d1018" stroke-width="0.9" fill="none" />
          </g>
        ))}
        {flaws.whitening.filter((b) => back || b.front).map((b) => (
          <ellipse cx={mx(b.x)} cy={b.y} rx={b.rx} ry={b.ry} fill={WHITE} opacity="0.92" transform={`rotate(${b.rot} ${mx(b.x)} ${b.y})`} />
        ))}
      </g>
    </svg>
  );
}
