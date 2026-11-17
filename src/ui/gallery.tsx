// Dev-only page (gallery.html): one sample card per condition, for tuning how flaws look.
import { render } from 'preact';
import { conditionFromWear, tierId } from '../core/condition';
import { Rng } from '../core/rng';
import { CardView } from './components/CardView';
import './styles.css';

const rng = new Rng(Number(new URLSearchParams(location.search).get('seed') ?? 1));
const WEAR = [10, 9.6, 9, 8.2, 7.5, 6.3, 5.5, 4.7, 3.8, 2.8, 2, 1.2];
const cards = WEAR.map((w, i) => ({ uid: i, cardId: 'duskpaw', seed: rng.int(1, 1e9), cond: conditionFromWear(rng, w, 9.8) }));

render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', padding: '8px' }}>
    {cards.flatMap((c) => (['back', 'front'] as const).map((side) => (
      <div style={{ textAlign: 'center', fontSize: '12px' }}>
        <CardView card={c} side={side} />
        {tierId(c.cond.wear)} {c.cond.wear} {side}
      </div>
    )))}
  </div>,
  document.getElementById('app')!,
);
