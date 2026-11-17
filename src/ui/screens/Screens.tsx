import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from '../../config';
import { cardDef } from '../../core/cards';
import { dayName, weekOf, type GameState } from '../../core/game';
import { DebugPanel, HagglePanel, SalesPanel } from '../components/Panels';
import { companyOf } from '../components/Slab';
import { ZoomCard } from '../components/ZoomCard';
import { clock, dispatch, money, newGame, quitGame, setDebug, useStore } from '../store';
import { GradeReturns, Inventory } from './Inventory';

export function Title() {
  const { debug } = useStore();
  const [seed, setSeed] = useState('');
  return (
    <div class="screen center">
      <h1>Card Show<br />Hustle</h1>
      <p class="muted">Buy low. Trust your eye. Prototype build · Milestone 2</p>
      <button class="btn primary big" onClick={() => newGame(seed)}>New game</button>
      <label class="field">Seed (optional, repeats a run)
        <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} placeholder="random" />
      </label>
      <label class="check"><input type="checkbox" checked={debug} onChange={(e) => setDebug((e.target as HTMLInputElement).checked)} /> Debug panel (shows hidden values)</label>
    </div>
  );
}

function Hud({ game, onInventory }: { game: GameState; onInventory: () => void }) {
  const t = game.show?.timeLeft ?? 0;
  return (
    <header class="hud">
      <div class="hud-row">
        <span>Wk {weekOf(game.day)} · {dayName(game.day).slice(0, 3)}</span>
        <span class={t <= 30 ? 'clock low' : 'clock'}>{clock(t)}</span>
        <button class="hud-inv" onClick={onInventory}>🃏 {game.inventory.length}</button>
        <b class="cash">{money(game.cash)}</b>
      </div>
      <div class="bar"><div style={{ width: `${(t / CONFIG.show.dayLengthSec) * 100}%` }} /></div>
    </header>
  );
}

export function Morning({ game }: { game: GameState }) {
  const [inv, setInv] = useState(false);
  if (game.returns.length) return <GradeReturns game={game} />;
  if (inv) return <Inventory game={game} onClose={() => setInv(false)} />;
  const away = game.inventory.filter((o) => o.grading).length;
  return (
    <div class="screen center">
      <p class="muted">Week {weekOf(game.day)}</p>
      <h1>{dayName(game.day)}</h1>
      <p>Cash {money(game.cash)} · {game.inventory.length} cards{away ? ` (${away} at grading)` : ''}</p>
      <button class="btn primary big" onClick={() => dispatch({ type: 'startDay' })}>Open the table</button>
      <button class="btn big" onClick={() => setInv(true)}>🃏 Inventory</button>
      <button class="btn ghost" onClick={quitGame}>Quit to title</button>
    </div>
  );
}

export function Show({ game }: { game: GameState }) {
  const { debug } = useStore();
  const [tab, setTab] = useState<'deal' | 'sales' | 'debug'>('deal');
  const [inv, setInv] = useState(false);
  const enc = game.show?.encounter ?? null;

  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      // Cap the step so a backgrounded tab does not eat the whole day.
      dispatch({ type: 'tick', dt: Math.min(1, (now - last) / 1000) });
      last = now;
    }, 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setTab('deal'), [enc?.card.uid]);

  // The clock keeps running while you look through stock.
  if (inv) return <Inventory game={game} onClose={() => setInv(false)} />;
  return (
    <div class="screen">
      <Hud game={game} onInventory={() => setInv(true)} />
      {!enc ? (
        <div class="waiting">
          <div class="walker">🚶</div>
          <p>Someone's heading to your table…</p>
          <p class="muted">Bought today: {game.log.bought.length}</p>
        </div>
      ) : (
        <>
          <div class="seller">
            <span class="avatar">{enc.seller.avatar}</span>
            <div class="bubble"><b>{enc.seller.name}</b>{enc.line}</div>
          </div>
          <ZoomCard key={enc.card.uid} card={enc.card} />
          <nav class="tabs">
            <button class={tab === 'deal' ? 'on' : ''} onClick={() => setTab('deal')}>Haggle</button>
            <button class={tab === 'sales' ? 'on' : ''} onClick={() => setTab('sales')}>Sales</button>
            {debug && <button class={tab === 'debug' ? 'on' : ''} onClick={() => setTab('debug')}>🐞</button>}
          </nav>
          <div class="panel">
            {tab === 'deal' && <HagglePanel key={enc.card.uid} game={game} enc={enc} />}
            {tab === 'sales' && <SalesPanel game={game} cardId={enc.card.cardId} />}
            {tab === 'debug' && debug && <DebugPanel game={game} enc={enc} />}
          </div>
        </>
      )}
    </div>
  );
}

const signed = (n: number) => {
  const r = Math.round(n);
  return <b class={r >= 0 ? 'pos' : 'neg'}>{r >= 0 ? '+' : '−'}{money(Math.abs(r))}</b>;
};

export function DayEnd({ game }: { game: GameState }) {
  const [inv, setInv] = useState(false);
  if (inv) return <Inventory game={game} onClose={() => setInv(false)} />;
  const { bought, sold, graded, seen, passed, walked, cashStart } = game.log;
  const spent = bought.reduce((s, b) => s + b.paid, 0);
  const edge = bought.reduce((s, b) => s + b.trueValue - b.paid, 0);
  return (
    <div class="screen scroll">
      <h2>{dayName(game.day)} recap · Week {weekOf(game.day)}</h2>
      <div class="stats">
        <div><b>{seen}</b>customers</div>
        <div><b>{bought.length}</b>bought</div>
        <div><b>{passed}</b>passed</div>
        <div><b>{walked}</b>walked</div>
      </div>
      <p>Cash {money(cashStart)} → <b>{money(game.cash)}</b> ({signed(game.cash - cashStart)})</p>
      {bought.length > 0 && <p>Spent <b>{money(spent)}</b> · value vs paid {signed(edge)}</p>}
      <div class="recap-list">
        {bought.map((b) => (
          <div class="recap-row">
            <span>{cardDef(b.cardId).name} <i class="tier">{b.tier}</i></span>
            <span class="muted">paid {money(b.paid)}</span>
            <span>worth {money(b.trueValue)}</span>
            {signed(b.trueValue - b.paid)}
          </div>
        ))}
        {bought.length === 0 && <p class="muted">You didn't buy anything today.</p>}
      </div>
      {sold.length > 0 && (
        <>
          <h3>Sold</h3>
          <div class="recap-list">
            {sold.map((s) => (
              <div class="recap-row">
                <span>{cardDef(s.cardId).name} {s.slab && <i class="tier slabbed">{companyOf(s.slab.company).name} {s.slab.grade}</i>}</span>
                <span class="muted">cost {money(s.cost)}</span>
                <span>{s.via} {money(s.price)}</span>
                {signed(s.price - s.cost)}
              </div>
            ))}
          </div>
        </>
      )}
      {graded.length > 0 && (
        <>
          <h3>Sent for grading</h3>
          <div class="recap-list">
            {graded.map((g) => (
              <div class="recap-row two"><span>{cardDef(g.cardId).name} → {g.company}</span><span class="muted">fee {money(g.fee)}</span></div>
            ))}
          </div>
        </>
      )}
      <button class="btn big" onClick={() => setInv(true)}>🃏 Inventory ({game.inventory.length})</button>
      <button class="btn primary big" onClick={() => dispatch({ type: 'nextDay' })}>Next show day →</button>
    </div>
  );
}
