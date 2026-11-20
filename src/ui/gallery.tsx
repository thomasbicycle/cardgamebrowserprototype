// Dev-only page (gallery.html): one sample card per condition, for tuning how flaws look.
import { render } from 'preact';
import { conditionFromWear, marksFor, tierId } from '../core/condition';
import { Rng } from '../core/rng';
import { CardView } from './components/CardView';
import './styles.css';

const rng = new Rng(Number(new URLSearchParams(location.search).get('seed') ?? 1));
const WEAR = [9.8, 9, 8.2, 7.5, 6.8, 6.1, 5.6, 4.7, 4.2, 3.2, 2.2, 1.4];
const cards = WEAR.map((w, i) => ({ uid: i, cardId: 'duskpaw', seed: rng.int(1, 1e9), cond: conditionFromWear(rng, w, 9.8) }));

render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', padding: '8px' }}>
    {cards.flatMap((c) => (['back', 'front'] as const).map((side) => (
      <div style={{ textAlign: 'center', fontSize: '12px' }}>
        <CardView card={c} side={side} />
        {tierId(c.cond.wear)} {c.cond.wear} · {marksFor(c.cond.wear)} marks · {side}
      </div>
    )))}
  </div>,
  document.getElementById('app')!,
);
