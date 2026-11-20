// Every tunable lives here. Game logic reads from CONFIG; nothing is hard-coded elsewhere.

export const CONFIG = {
  startingCash: 1000,

  show: {
    dayLengthSec: 180,
    /** Hidden number of customers who will walk up in a day (inclusive range). */
    customers: [8, 14] as [number, number],
    /** Seconds between one customer leaving and the next arriving. */
    walkUpDelaySec: [2, 5] as [number, number],
  },

  /** Near Mint raw value range per rarity, and how often each rarity walks up. */
  rarities: {
    common: { label: 'Common', symbol: '●', value: [5, 20], w: 30, gradedSales: [3, 5] },
    uncommon: { label: 'Uncommon', symbol: '◆', value: [25, 70], w: 35, gradedSales: [5, 8] },
    rare: { label: 'Rare', symbol: '★', value: [90, 260], w: 25, gradedSales: [8, 12] },
    ultra: { label: 'Ultra Rare', symbol: '✦', value: [350, 900], w: 10, gradedSales: [10, 14] },
  },

  condition: {
    /**
     * Raw condition tiers by hidden wear score (1-10, worst of corners/edges/surface).
     * rawMult is vs Near Mint price. Centering does not change the raw tier, only the grade.
     */
    tiers: [
      { id: 'NM', label: 'Near Mint', min: 8, rawMult: 1, desc: 'Two tiny marks at most. Crisp corners, clean edges.' },
      { id: 'LP', label: 'Lightly Played', min: 6, rawMult: 0.78, desc: '3 or 4 small marks: tiny edge nicks, corner dots or light scratches. No creases.' },
      { id: 'MP', label: 'Moderately Played', min: 4.5, rawMult: 0.58, desc: '5 to 9 marks: edge nicks, corner whitening, scratches or scuffs. No creases.' },
      { id: 'HP', label: 'Heavily Played', min: 2.5, rawMult: 0.38, desc: '10 or more marks: heavy whitening or scratching, maybe one or two very small creases. Still intact.' },
      { id: 'DMG', label: 'Damaged', min: 0, rawMult: 0.2, desc: 'Anything worse: big creases, tears, stains or extreme wear.' },
    ],
    /**
     * Marks per tier (whitening, scratches, scuffs; front and back together). This is what defines the tier
     * on screen: count the marks and you know the condition. Ranges must not overlap.
     */
    marks: { NM: [0, 2], LP: [3, 4], MP: [5, 9], HP: [10, 16], DMG: [17, 40] } as Record<TierId, [number, number]>,
    /** Share of walk-up cards in each raw tier (weights, need not sum to 100). Wear is spread evenly inside a tier. */
    distribution: { NM: 40, LP: 25, MP: 15, HP: 10, DMG: 10 } as Record<TierId, number>,
    /**
     * Corners, edges and surface stay within this many points of the worst one.
     * Worn cards spread wider, so a Heavily Played card is usually bad in one way (whitening OR scratches OR creases), not all.
     */
    spread: { base: 1.2, perPointBelow8: 0.6 },
    /** Centering score = 10 - |normal| * sd, floored at min. 9.5+ is 55/45 or better. */
    centering: { sd: 0.9, min: 5.5 },
  },

  /**
   * How big each flaw is at a given sub-score (how many is set by condition.marks); values between rows are
   * interpolated. Paired rows (6 / 5.99, 4.5 / 4.49, 2.5 / 2.49) make each tier a clear step from the one above.
   * Sizes are in card units (card is 250 wide); even the smallest stays visible when zoomed in. creases is a count.
   */
  flaws: {
    anchors: [
      { cond: 10, nickLen: 4, nickDepth: 1.5, cornerSize: 2, scratchLen: 14, scratchOp: 0.5, creases: 0 },
      { cond: 8, nickLen: 4.4, nickDepth: 1.6, cornerSize: 2.1, scratchLen: 15, scratchOp: 0.52, creases: 0 },
      { cond: 6, nickLen: 5, nickDepth: 1.7, cornerSize: 2.3, scratchLen: 18, scratchOp: 0.55, creases: 0 },
      { cond: 5.99, nickLen: 5.5, nickDepth: 1.8, cornerSize: 2.4, scratchLen: 22, scratchOp: 0.56, creases: 0 },
      { cond: 4.5, nickLen: 6, nickDepth: 1.9, cornerSize: 2.6, scratchLen: 26, scratchOp: 0.58, creases: 0 },
      { cond: 4.49, nickLen: 8, nickDepth: 2.1, cornerSize: 3, scratchLen: 28, scratchOp: 0.58, creases: 0.5 },
      { cond: 2.5, nickLen: 11, nickDepth: 2.4, cornerSize: 3.4, scratchLen: 34, scratchOp: 0.6, creases: 1.6 },
      { cond: 2.49, nickLen: 12, nickDepth: 2.6, cornerSize: 3.8, scratchLen: 45, scratchOp: 0.62, creases: 1.6 },
      { cond: 1, nickLen: 15, nickDepth: 3.2, cornerSize: 5.5, scratchLen: 90, scratchOp: 0.7, creases: 3 },
    ],
    /** Share of surface marks that are hazy scuffs rather than scratches. */
    scuffShare: 0.25,
    /** Minimum distance between marks (card units), so a few marks never merge into one. */
    minGap: 9,
    /** On NM to MP cards, at most this many marks sit on corners, one per corner (the rest go to edges), so none overlap. */
    maxCornerMarks: 4,
    /** Small creases (Heavily Played and worse): length range in card units, and at most this many below Damaged. */
    smallCrease: { len: [8, 20] as [number, number], maxHP: 2 },
    /** Share of cards whose wear is mostly on the back, so the front looks clean until you flip it. */
    backHeavyChance: 0.4,
    /** Chance a scratch / scuff / small whitening mark shows on the front: [normal card, back-heavy card]. */
    frontShare: { scratch: [0.7, 0.12], scuff: [0.6, 0.1], whitening: [0.3, 0.06] },
    /** Whitening bigger than this (card units) always shows on the front too: [normal, back-heavy]. */
    frontWhiteningSize: { corner: [3.2, 4.5], edge: [2.3, 2.8] },
    /** Damaged cards always get at least one of these, more as wear drops toward 1. */
    structural: [
      { id: 'bigCrease', w: 3 },
      { id: 'tear', w: 2 },
      { id: 'stain', w: 2 },
    ],
  },

  grading: {
    /** Std-dev added to true condition before rounding to a grade. */
    variance: 0.35,
    /** Graded value as a multiple of Near Mint raw. [min,max] is fixed per card. */
    multipliers: {
      10: [8, 10], 9: [2, 3], 8: [1.3, 1.3], 7: [1, 1], 6: [0.8, 0.8],
      5: [0.62, 0.62], 4: [0.5, 0.5], 3: [0.4, 0.4], 2: [0.3, 0.3], 1: [0.22, 0.22],
    } as Record<number, [number, number]>,
    gradeNames: {
      10: 'GEM MINT', 9: 'MINT', 8: 'NM-MT', 7: 'NEAR MINT', 6: 'EX-MT',
      5: 'EXCELLENT', 4: 'VG-EX', 3: 'VERY GOOD', 2: 'GOOD', 1: 'POOR',
    } as Record<number, string>,
    /**
     * premium = how the market prices this company's slabs vs the top company.
     * services = what the player can submit to; a company with none only shows up in sales.
     * days = turnaround in calendar days (inclusive range, rolled at submission).
     */
    companies: [
      { id: 'pra', name: 'PRA', premium: 1, label: { bg: '#fbfbf7', fg: '#16161c', accent: '#c9302c' }, services: [{ id: 'fast', name: 'Fast', fee: 100, days: [3, 5] }] as GradingService[] },
      { id: 'cgx', name: 'CGX', premium: 0.9, label: { bg: '#eaf1ff', fg: '#0f1d44', accent: '#2f5fd0' }, services: [{ id: 'value', name: 'Value', fee: 15, days: [18, 24] }] as GradingService[] },
      { id: 'buckett', name: 'Buckett', premium: 0.95, label: { bg: '#d6d8de', fg: '#15151a', accent: '#8a6a22' }, services: [] as GradingService[] },
      { id: 'tagd', name: 'TAGD', premium: 0.85, label: { bg: '#15171c', fg: '#f2f2f2', accent: '#3fbf7f' }, services: [] as GradingService[] },
    ],
  },

  seller: {
    /** Ask as a fraction of the card's true value. */
    askBuckets: [
      { id: 'normal', w: 76, range: [0.85, 1.0] },
      { id: 'clueless', w: 12, range: [0.5, 0.7] },
      { id: 'delusional', w: 12, range: [1.2, 1.6] },
    ],
    /** Hidden floor as a fraction of the ask (low = drops a lot, high = barely budges). */
    floorFracOfAsk: [0.6, 0.97] as [number, number],
    /** Walk-away line = floor - this fraction of true value (or the dollar gap below, if larger). */
    walkLineFracOfTrue: 0.2,
    minWalkGapDollars: 4,
    /** Cheap cards: sellers think in dollars. Below this ask, the floor is also at least this many dollars under the ask. */
    cheap: { askBelow: 20, floorDropDollars: [3, 6] as [number, number] },
    /** Counters a seller will make before leaving (inclusive range). */
    patience: [3, 4] as [number, number],
    /** First counter closes this fraction of the ask-to-floor gap (halved for offers near the walk line). */
    firstConcession: [0.25, 0.45] as [number, number],
    /** After that the seller only moves when the player does: they drop this many dollars per dollar the player comes up. */
    reciprocity: [0.6, 1.3] as [number, number],
    /** A single counter never closes more than this fraction of the remaining gap, so the floor is never shown. */
    maxStepFrac: 0.5,
    /** Re-roll a seller up to this many times if the ask is far beyond the player's cash. */
    affordRerolls: 3,
    affordFactor: 1.5,
  },

  marketplaces: [
    /** bias = typical price vs the market, noise = std-dev of the log price. Kept small: sales sit close to true value. */
    { id: 'ebuy', name: 'eBuy', w: 50, bias: 1.0, noise: 0.07, raw: true, minPrice: 0 },
    { id: 'fanatix', name: 'Fanatix', w: 20, bias: 1.0, noise: 0.06, raw: true, minPrice: 0 },
    { id: 'altt', name: 'Altt', w: 18, bias: 1.01, noise: 0.05, raw: false, minPrice: 50 },
    { id: 'gavel', name: 'Golden Gavel', w: 12, bias: 1.02, noise: 0.07, raw: false, minPrice: 150 },
  ],

  sales: {
    lookbackDays: 30,
    /**
     * True value of a copy = the wholesaler comp for its condition (or slab): average the `last` most recent
     * clean sales (no auction or bad-listing outliers), then move `recentWeight` of the way to the newest one.
     * e.g. $375 (newest), $290, $325 -> average $330 -> comp $352.50.
     */
    comp: { last: 3, recentWeight: 0.5 },
    /** Raw sales generated per condition, so every condition filter has at least 5 comps. */
    rawPerTier: { NM: [6, 10], LP: [5, 8], MP: [5, 7], HP: [5, 6], DMG: [5, 6] } as Record<string, [number, number]>,
    gradeWeights: { 10: 6, 9: 14, 8: 8, 7: 4, 6: 2, 5: 1 } as Record<number, number>,
    /** When looking at one company + grade, at least this many comps exist (inclusive range). */
    focusComps: [5, 7] as [number, number],
    outlierChance: 0.14,
    outliers: [
      { id: 'badPhoto', w: 4, mult: [0.55, 0.75], note: '1 photo · blurry' },
      { id: 'lateAuction', w: 3, mult: [0.5, 0.8], note: 'Auction · ended 3:14 AM' },
      { id: 'biddingWar', w: 3, mult: [1.3, 1.7], note: 'Auction · 31 bids' },
    ],
  },

  wholesale: { raw: 0.8, graded: 0.85 },

  market: {
    /** Each card's starting NM price is its base value times a factor in this range. */
    startSpread: [0.9, 1.1] as [number, number],
  },
};

export interface GradingService { id: string; name: string; fee: number; days: [number, number] }
export type RarityId = keyof typeof CONFIG.rarities;
export type TierId = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
