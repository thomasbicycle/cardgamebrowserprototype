import { useEffect, useState } from 'preact/hooks';
import { CONFIG } from '../../config';
import { cardDef } from '../../core/cards';
import { dayName, weekOf, wholesaleValue, type GameState } from '../../core/game';
import { DebugPanel, HagglePanel, SalesPanel } from '../components/Panels';
import { ZoomCard } from '../components/ZoomCard';
import { dispatch, money, newGame, quitGame, setDebug, useStore } from '../store';

export function Title() {
  const { debug } = useStore();
  const [seed, setSeed] = useState('');
  return (
    <div class="screen center">
      <h1>Card Show<br />Hustle</h1>
      <p class="muted">Buy low. Trust your eye. Prototype build · Milestone 1.1</p>
      <button class="btn primary big" onClick={() => newGame(seed)}>New game</button>
      <label class="field">Seed (optional, repeats a run)
        <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} placeholder="random" />
      </label>
      <label class="check"><input type="checkbox" checked={debug} onChange={(e) => setDebug((e.target as HTMLInputElement).checked)} /> Debug panel (shows hidden values)</label>
    </div>
  );
}

function Hud({ game }: { game: GameState }) {
  const t = Math.ceil(game.show?.timeLeft ?? 0);
  const frac = (game.show?.timeLeft ?? 0) / CONFIG.show.dayLengthSec;
  return (
    <header class="hud">
      <div class="hud-row">
        <span>Wk {weekOf(game.day)} · {dayName(game.day).slice(0, 3)}</span>
        <span class={t <= 30 ? 'clock low' : 'clock'}>{Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')}</span>
        <span>🃏 {game.inventory.length}</span>
        <b class="cash">{money(game.cash)}</b>
      </div>
      <div class="bar"><div style={{ width: `${frac * 100}%` }} /></div>
    </header>
  );
}

export function Morning({ game }: { game: GameState }) {
  return (
    <div class="screen center">
      <p class="muted">Week {weekOf(game.day)}</p>
      <h1>{dayName(game.day)}</h1>
      <p>Cash {money(game.cash)} · {game.inventory.length} cards in stock</p>
      <button class="btn primary big" onClick={() => dispatch({ type: 'startDay' })}>Open the table</button>
      <button class="btn ghost" onClick={quitGame}>Quit to title</button>
    </div>
  );
}

export function Show({ game }: { game: GameState }) {
  const { debug } = useStore();
  const [tab, setTab] = useState<'deal' | 'sales' | 'debug'>('deal');
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

  return (
    <div class="screen">
      <Hud game={game} />
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

export function DayEnd({ game }: { game: GameState }) {
  const { bought, seen, passed, walked } = game.log;
  const spent = bought.reduce((s, b) => s + b.paid, 0);
  const edge = bought.reduce((s, b) => s + b.trueValue - b.paid, 0);
  const stockValue = game.inventory.reduce((s, o) => s + wholesaleValue(game, o), 0);
  return (
    <div class="screen scroll">
      <h2>{dayName(game.day)} recap · Week {weekOf(game.day)}</h2>
      <div class="stats">
        <div><b>{seen}</b>customers</div>
        <div><b>{bought.length}</b>bought</div>
        <div><b>{passed}</b>passed</div>
        <div><b>{walked}</b>walked</div>
      </div>
      <p>Spent <b>{money(spent)}</b> · value vs paid <b class={edge >= 0 ? 'pos' : 'neg'}>{edge >= 0 ? '+' : '−'}{money(Math.abs(edge))}</b></p>
      <div class="recap-list">
        {bought.map((b) => {
          const d = b.trueValue - b.paid;
          return (
            <div class="recap-row">
              <span>{cardDef(b.cardId).name} <i class="tier">{b.tier}</i></span>
              <span class="muted">paid {money(b.paid)}</span>
              <span>worth {money(b.trueValue)}</span>
              <b class={d >= 0 ? 'pos' : 'neg'}>{d >= 0 ? '+' : '−'}{money(Math.abs(d))}</b>
            </div>
          );
        })}
        {bought.length === 0 && <p class="muted">You didn't buy anything today.</p>}
      </div>
      <p class="muted">Raw market value shown. Grading and real selling arrive in Milestone 2.</p>
      {game.inventory.length > 0 && (
        <button class="btn" onClick={() => dispatch({ type: 'wholesaleAll' })}>
          Wholesale all {game.inventory.length} cards for {money(stockValue)} (temporary)
        </button>
      )}
      <button class="btn primary big" onClick={() => dispatch({ type: 'nextDay' })}>Next show day →</button>
    </div>
  );
}
