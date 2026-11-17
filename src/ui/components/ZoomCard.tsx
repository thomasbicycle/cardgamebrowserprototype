import { useEffect, useRef, useState } from 'preact/hooks';
import { CARD_H, CARD_W, type CardInstance } from '../../core/condition';
import type { Slab } from '../../core/game';
import { CardView } from './CardView';
import { SLAB, SlabView } from './Slab';

interface View { s: number; cx: number; cy: number }
const MAX_ZOOM = 8;

/** Card inspector: pinch or wheel to zoom, drag to pan, double-tap to jump in, flip for the back. */
export function ZoomCard({ card, slab }: { card: CardInstance; slab?: Slab }) {
  // Area that can be looked at, in card units: the card, or the whole slab around it.
  const B = slab ? SLAB : { x: 0, y: 0, w: CARD_W, h: CARD_H };
  const HOME: View = { s: 1, cx: B.x + B.w / 2, cy: B.y + B.h / 2 };
  const clampView = (v: View): View => {
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
    if (s === 1) return HOME;
    return { s, cx: Math.min(B.x + B.w, Math.max(B.x, v.cx)), cy: Math.min(B.y + B.h, Math.max(B.y, v.cy)) };
  };
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [full, setFull] = useState(false);
  const [view, setView] = useState<View>(HOME);
  useEffect(() => setView(HOME), [!!slab]);
  const [size, setSize] = useState({ w: 300, h: 300 });
  const el = useRef<HTMLDivElement>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; mx: number; my: number } | null>(null);
  const tap = useRef({ t: 0, moved: 0 });

  useEffect(() => {
    const node = el.current!;
    const ro = new ResizeObserver(() => setSize({ w: node.clientWidth || 300, h: node.clientHeight || 300 }));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Card units visible across the pane at zoom 1 (card plus a small margin).
  const baseW = Math.max(B.w + 16, ((B.h + 16) * size.w) / size.h);
  const upp = (s: number) => baseW / (s * size.w);
  const vbW = baseW / view.s;
  const vbH = (vbW * size.h) / size.w;

  const zoomAt = (px: number, py: number, ratio: number) =>
    setView((v) => {
      const s2 = Math.min(MAX_ZOOM, Math.max(1, v.s * ratio));
      const ox = px - size.w / 2, oy = py - size.h / 2;
      const ux = v.cx + ox * upp(v.s), uy = v.cy + oy * upp(v.s);
      return clampView({ s: s2, cx: ux - ox * upp(s2), cy: uy - oy * upp(s2) });
    });
  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, local(e));
    pinch.current = null;
    tap.current.moved = 0;
  };
  const onMove = (e: PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    ptrs.current.set(e.pointerId, cur);
    const all = [...ptrs.current.values()];
    if (all.length === 1) {
      const dx = cur.x - prev.x, dy = cur.y - prev.y;
      tap.current.moved += Math.abs(dx) + Math.abs(dy);
      setView((v) => clampView({ ...v, cx: v.cx - dx * upp(v.s), cy: v.cy - dy * upp(v.s) }));
    } else if (all.length === 2) {
      const [a, b] = all;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const p = pinch.current;
      if (p) {
        zoomAt(mx, my, d / p.d);
        setView((v) => clampView({ ...v, cx: v.cx - (mx - p.mx) * upp(v.s), cy: v.cy - (my - p.my) * upp(v.s) }));
      }
      pinch.current = { d, mx, my };
      tap.current.moved = 99;
    }
  };
  const onUp = (e: PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    pinch.current = null;
    if (tap.current.moved > 8) return;
    const now = performance.now();
    if (now - tap.current.t < 320) {
      const p = local(e);
      view.s > 1.05 ? setView(HOME) : zoomAt(p.x, p.y, 3.5);
      tap.current.t = 0;
    } else tap.current.t = now;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  };

  return (
    <div class={`zoom ${full ? 'zoom-full' : ''}`}>
      <div
        class="zoom-pane" ref={el}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
      >
        {slab
          ? <SlabView card={card} slab={slab} side={side} viewBox={`${view.cx - vbW / 2} ${view.cy - vbH / 2} ${vbW} ${vbH}`} />
          : <CardView card={card} side={side} viewBox={`${view.cx - vbW / 2} ${view.cy - vbH / 2} ${vbW} ${vbH}`} />}
      </div>
      <div class="zoom-tools">
        <button onClick={() => setSide(side === 'front' ? 'back' : 'front')}>↻ {side === 'front' ? 'Back' : 'Front'}</button>
        <button onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.6)} disabled={view.s <= 1}>−</button>
        <span class="zoom-level">{view.s.toFixed(1)}×</span>
        <button onClick={() => zoomAt(size.w / 2, size.h / 2, 1.6)} disabled={view.s >= MAX_ZOOM}>+</button>
        <button onClick={() => setFull(!full)}>{full ? '✕ Close' : '⤢ Full'}</button>
      </div>
    </div>
  );
}
