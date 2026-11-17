import type { ComponentChildren } from 'preact';
import { memo } from 'preact/compat';
import { useMemo, useState } from 'preact/hooks';
import { CONFIG } from '../../config';
import { cardDef } from '../../core/cards';
import { tierId } from '../../core/condition';
import { salesFor, showDayOn, shortDay, wholesaleValue, type GameState, type OwnedCard } from '../../core/game';
import { medianSale } from '../../core/sales';
import { CardView } from '../components/CardView';
import { OwnedDebug, SalesPanel } from '../components/Panels';
import { SlabView, companyOf } from '../components/Slab';
import { ZoomCard } from '../components/ZoomCard';
import { clock, dispatch, money, useStore } from '../store';

const USABLE = CONFIG.grading.companies.filter((c) => c.services.length);
const PREVIEW_GRADES = [10, 9, 8];
/** Comps the player would look up before deciding to grade: every usable company at 10 / 9 / 8. */
const GRADING_FOCUS = USABLE.flatMap((c) => PREVIEW_GRADES.map((grade) => ({ company: c.id, grade })));

const turnaround = ([a, b]: [number, number]) => {
  const d = (a + b) / 2;
  return d >= 14 ? `~${Math.round(d / 7)} weeks` : `~${Math.round(d)} days`;
};

/** Small picture of a card, or of its slab once graded. Memoised: the list re-renders on every clock tick. */
export const Thumb = memo(
  ({ o, hideGrade }: { o: OwnedCard; hideGrade?: boolean }) => {
    const slab = o.slab && !hideGrade;
    return (
      <div class={slab ? 'thumb slab' : 'thumb'}>
        {slab ? <SlabView card={o.card} slab={o.slab!} side="front" /> : <CardView card={o.card} side="front" />}
      </div>
    );
  },
  (a, b) => a.o.card.uid === b.o.card.uid && a.hideGrade === b.hideGrade && a.o.slab?.grade === b.o.slab?.grade,
);

/** Raw condition is revealed at the day's recap, so cards bought during the current show stay unlabelled until then. */
const Badge = ({ o, game }: { o: OwnedCard; game: GameState }) =>
  o.slab ? <i class="tier slabbed">{companyOf(o.slab.company).name} {o.slab.grade}</i>
    : game.phase === 'show' && o.boughtDay === game.day ? null : <i class="tier">{tierId(o.card.cond.wear)}</i>;

const cost = (o: OwnedCard) => (o.fees ? `${money(o.paid)} + ${money(o.fees)} grading` : money(o.paid));
const status = (o: OwnedCard) =>
  o.grading ? `At ${companyOf(o.grading.company).name} · back ${shortDay(showDayOn(o.grading.returnsOn))}` : `Cost ${cost(o)} · ${shortDay(o.boughtDay)}`;

function Head({ game, back, title }: { game: GameState; back: [string, () => void]; title: ComponentChildren }) {
  return (
    <header class="inv-head">
      <button class="btn ghost" onClick={back[1]}>← {back[0]}</button>
      <b class="inv-title">{title}</b>
      {game.phase === 'show' && game.show && <span class="clock">{clock(game.show.timeLeft)}</span>}
      <b class="cash">{money(game.cash)}</b>
    </header>
  );
}

/** Full-screen stock list. Usable from the morning, the recap, or mid-show (the clock keeps running). */
export function Inventory({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const owned = game.inventory.find((o) => o.card.uid === open);
  if (owned) return <Detail game={game} o={owned} onBack={() => setOpen(null)} />;

  const list = [...game.inventory].reverse();
  const raw = game.inventory.filter((o) => !o.slab && !o.grading);
  const rawTotal = raw.reduce((s, o) => s + wholesaleValue(game, o), 0);
  return (
    <div class="screen">
      <Head game={game} back={['Back', onClose]} title={`Inventory · ${game.inventory.length}`} />
      <div class="inv-list">
        {list.map((o) => (
          <button class="inv-row" onClick={() => setOpen(o.card.uid)}>
            <Thumb o={o} />
            <span class="inv-main"><b>{cardDef(o.card.cardId).name} <Badge o={o} game={game} /></b><small>{status(o)}</small></span>
            <span class="inv-val">{o.grading ? '📮' : <>{money(wholesaleValue(game, o))}<small>wholesale</small></>}</span>
          </button>
        ))}
        {list.length === 0 && <p class="muted empty">No cards yet. Buy some at the show.</p>}
      </div>
      {raw.length > 1 && (
        <div class="inv-foot">
          <button
            class={confirmBulk ? 'btn primary big' : 'btn big'}
            onClick={() => {
              if (!confirmBulk) return setConfirmBulk(true);
              dispatch({ type: 'wholesale', uids: raw.map((o) => o.card.uid) });
              setConfirmBulk(false);
            }}
          >
            {confirmBulk ? `Tap again: sell ${raw.length} raw for ${money(rawTotal)}` : `Wholesale all raw (${raw.length}) · ${money(rawTotal)}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Detail({ game, o, onBack }: { game: GameState; o: OwnedCard; onBack: () => void }) {
  const { debug } = useStore();
  const [tab, setTab] = useState<'manage' | 'sales' | 'debug'>('manage');
  const s = o.slab;
  return (
    <div class="screen">
      <Head game={game} back={['Inventory', onBack]} title={<>{cardDef(o.card.cardId).name} <Badge o={o} game={game} /></>} />
      <ZoomCard key={`${o.card.uid}${s ? 's' : ''}`} card={o.card} slab={s} />
      <nav class="tabs">
        <button class={tab === 'manage' ? 'on' : ''} onClick={() => setTab('manage')}>Manage</button>
        <button class={tab === 'sales' ? 'on' : ''} onClick={() => setTab('sales')}>Sales</button>
        {debug && <button class={tab === 'debug' ? 'on' : ''} onClick={() => setTab('debug')}>🐞</button>}
      </nav>
      <div class="panel">
        {tab === 'manage' && <Manage game={game} o={o} />}
        {tab === 'sales' && (
          <SalesPanel
            game={game} cardId={o.card.cardId}
            focus={s ? [{ company: s.company, grade: s.grade }] : GRADING_FOCUS}
            chip={s ? { company: companyOf(s.company).name, grade: s.grade } : undefined}
          />
        )}
        {tab === 'debug' && debug && <OwnedDebug game={game} owned={o} />}
      </div>
    </div>
  );
}

function Manage({ game, o }: { game: GameState; o: OwnedCard }) {
  const [pick, setPick] = useState<{ co: string; sv: string } | null>(null);
  const [sell, setSell] = useState(false);
  const sales = useMemo(() => (o.slab || o.grading ? [] : salesFor(game, o.card.cardId, GRADING_FOCUS)), [game.seed, game.day, o.card.uid]);
  const ws = wholesaleValue(game, o);

  if (o.grading) {
    const co = companyOf(o.grading.company);
    return (
      <div class="manage">
        <p class="big-status">📮 At {co.name} ({co.services.find((x) => x.id === o.grading!.service)?.name})</p>
        <p>Due back {shortDay(showDayOn(o.grading.returnsOn))}. You'll see the grade when it arrives.</p>
        <p class="muted">Cost {cost(o)}</p>
      </div>
    );
  }
  const picked = pick && companyOf(pick.co);
  const pickedSv = picked && picked.services.find((x) => x.id === pick!.sv);
  return (
    <div class="manage">
      <p class="muted">{status(o)}</p>
      {!o.slab && (
        <>
          <h3>Send for grading</h3>
          {USABLE.flatMap((co) => co.services.map((sv) => (
            <button
              class={pick?.co === co.id && pick.sv === sv.id ? 'svc on' : 'svc'} disabled={game.cash < sv.fee}
              onClick={() => setPick(pick?.co === co.id && pick.sv === sv.id ? null : { co: co.id, sv: sv.id })}
            >
              <span><b>{co.name} {sv.name}</b> · {money(sv.fee)} · {turnaround(sv.days)}</span>
              <small>Recent {co.name}: {PREVIEW_GRADES.map((g) => `${g}s ≈ ${money(medianSale(sales, co.name, g))}`).join(' · ')}</small>
            </button>
          )))}
          {picked && pickedSv && (
            <button class="btn primary" onClick={() => { dispatch({ type: 'grade', uid: o.card.uid, company: picked.id, service: pickedSv.id }); setPick(null); }}>
              Submit to {picked.name} · {money(pickedSv.fee)}
            </button>
          )}
        </>
      )}
      <h3>Sell</h3>
      <button class={sell ? 'btn primary' : 'btn'} onClick={() => (sell ? dispatch({ type: 'wholesale', uids: [o.card.uid] }) : setSell(true))}>
        {sell ? `Tap again to sell for ${money(ws)}` : `Wholesale now · ${money(ws)}`}
      </button>
      <p class="muted">Wholesale pays {Math.round((o.slab ? CONFIG.wholesale.graded : CONFIG.wholesale.raw) * 100)}% of market on the spot. Display case selling arrives in Milestone 3.</p>
    </div>
  );
}

/** Morning mail: slabs back from the graders, revealed one tap at a time. */
export function GradeReturns({ game }: { game: GameState }) {
  const [shown, setShown] = useState<number[]>([]);
  const items = game.returns.map((uid) => game.inventory.find((o) => o.card.uid === uid)).filter((o): o is OwnedCard => !!o?.slab);
  const all = items.every((o) => shown.includes(o.card.uid));
  const totalCost = items.reduce((s, o) => s + o.paid + o.fees, 0);
  const totalWs = items.reduce((s, o) => s + wholesaleValue(game, o), 0);
  return (
    <div class="screen scroll">
      <h2>📬 Back from grading</h2>
      <p class="muted">{items.length === 1 ? 'A slab arrived' : `${items.length} slabs arrived`} while you were away. Tap each to see its grade.</p>
      <div class="recap-list">
        {items.map((o) => {
          const open = shown.includes(o.card.uid);
          const s = o.slab!;
          return (
            <button class={open ? 'ret open' : 'ret'} onClick={() => !open && setShown([...shown, o.card.uid])}>
              <Thumb o={o} hideGrade={!open} />
              <span class="inv-main">
                <b>{cardDef(o.card.cardId).name}</b>
                <small>{companyOf(s.company).name} · cost {money(o.paid + o.fees)}{open ? ` · wholesale ${money(wholesaleValue(game, o))}` : ''}</small>
              </span>
              {open ? <span class="grade-pop"><b>{s.grade}</b><small>{CONFIG.grading.gradeNames[s.grade]}</small></span> : <span class="reveal">Reveal</span>}
            </button>
          );
        })}
      </div>
      {all && items.length > 1 && (
        <p>Total cost {money(totalCost)} · wholesale now <b class={totalWs >= totalCost ? 'pos' : 'neg'}>{money(totalWs)}</b></p>
      )}
      <button
        class="btn primary big"
        onClick={() => (all ? dispatch({ type: 'ackReturns' }) : setShown(items.map((o) => o.card.uid)))}
      >
        {all ? 'Continue' : 'Reveal all'}
      </button>
    </div>
  );
}
