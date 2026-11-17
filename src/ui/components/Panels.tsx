import { useEffect, useMemo, useState } from 'preact/hooks';
import { tierOf } from '../../core/condition';
import { salesFor, type GameState } from '../../core/game';
import type { Encounter } from '../../core/seller';
import { dispatch, money } from '../store';

export function SalesPanel({ game, cardId }: { game: GameState; cardId: string }) {
  const [filter, setFilter] = useState<'all' | 'raw' | 'graded'>('all');
  const sales = useMemo(() => salesFor(game, cardId), [game.seed, game.day, cardId]);
  const rows = sales.filter((s) => filter === 'all' || s.kind === filter);
  return (
    <div class="sales">
      <div class="chips">
        {(['all', 'raw', 'graded'] as const).map((f) => (
          <button class={filter === f ? 'chip on' : 'chip'} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <span class="muted">sold · last 30 days</span>
      </div>
      <div class="sales-list">
        {rows.map((s) => (
          <div class="sale">
            <span class={`mp mp-${s.marketplace.replace(/\s/g, '')}`}>{s.marketplace}</span>
            <span class="sale-main">
              <b>{s.kind === 'raw' ? `Raw · ${s.tier}` : `${s.company} ${s.grade}`}</b>
              <small>{s.daysAgo === 0 ? 'today' : `${s.daysAgo}d ago`}{s.note ? ` · ${s.note}` : ''}</small>
            </span>
            <span class="sale-price">${s.price.toFixed(2)}</span>
          </div>
        ))}
        {rows.length === 0 && <p class="muted">No recent {filter} sales.</p>}
      </div>
    </div>
  );
}

export function HagglePanel({ game, enc }: { game: GameState; enc: Encounter }) {
  const s = enc.seller;
  const [amount, setAmount] = useState(s.currentAsk);
  // After a counter, never leave the offer sitting above the new ask.
  useEffect(() => setAmount((a) => Math.min(a, s.currentAsk)), [s.currentAsk]);
  const step = s.ask < 40 ? 1 : s.ask < 200 ? 5 : 10;
  const set = (n: number) => setAmount(Math.max(0, Math.min(s.currentAsk, Math.round(n))));

  if (enc.status !== 'open') {
    return (
      <div class="haggle">
        <div class={`result result-${enc.status}`}>
          {enc.status === 'deal' ? `Bought for ${money(enc.paid!)}` : enc.status === 'walked' ? 'Seller walked away' : 'You passed'}
        </div>
        <button class="btn primary big" onClick={() => dispatch({ type: 'next' })}>Next customer →</button>
      </div>
    );
  }
  const broke = amount > game.cash;
  return (
    <div class="haggle">
      {enc.offers.length > 0 && (
        <div class="offer-log">
          {enc.offers.map((o) => <span>You {money(o.amount)} → {o.counter ? money(o.counter) : '—'}</span>)}
        </div>
      )}
      <div class="offer-row">
        <button class="btn step" onClick={() => set(amount - step)}>−{step}</button>
        <div class="offer-amount">{money(amount)}<small>{Math.round((amount / s.currentAsk) * 100)}% of ask</small></div>
        <button class="btn step" onClick={() => set(amount + step)}>+{step}</button>
      </div>
      <input type="range" min="0" max={s.currentAsk} step="1" value={amount} onInput={(e) => set(Number((e.target as HTMLInputElement).value))} />
      <button class="btn primary big" disabled={broke || amount <= 0} onClick={() => dispatch({ type: 'offer', amount })}>
        {broke ? 'Not enough cash' : `Offer ${money(amount)}`}
      </button>
      <div class="btn-row">
        <button class="btn" disabled={s.currentAsk > game.cash} onClick={() => dispatch({ type: 'payAsk' })}>Pay {money(s.currentAsk)}</button>
        <button class="btn danger" onClick={() => dispatch({ type: 'pass' })}>Pass</button>
      </div>
    </div>
  );
}

/** Hidden values, for tuning only. Shown when debug is switched on. */
export function DebugPanel({ game, enc }: { game: GameState; enc: Encounter }) {
  const c = enc.card.cond, s = enc.seller;
  const rows: [string, string][] = [
    ['True value (this copy)', `$${enc.trueValue.toFixed(2)}`],
    ['NM market price', `$${game.market.nm[enc.card.cardId].toFixed(2)}`],
    ['Condition', `${c.overall} (${tierOf(c.overall).id})`],
    ['Centering / corners', `${c.centering} / ${c.corners}`],
    ['Edges / surface', `${c.edges} / ${c.surface}`],
    ['Seller type', `${s.bucket} (${Math.round((s.ask / enc.trueValue) * 100)}% ask)`],
    ['Floor', `$${s.floor.toFixed(2)}`],
    ['Walk-away line', `$${s.walkLine.toFixed(2)}`],
    ['Counters used', `${s.counters} of ${s.patience}`],
    ['Customers left today', String(game.show?.customersLeft ?? 0)],
    ['Seed', String(game.seed)],
  ];
  return (
    <div class="debug">
      {rows.map(([k, v]) => <div><span>{k}</span><b>{v}</b></div>)}
    </div>
  );
}
