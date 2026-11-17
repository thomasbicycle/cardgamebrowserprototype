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
      { id: 'NM', label: 'Near Mint', min: 8, rawMult: 1, desc: 'Looks nearly unplayed. Crisp corners and clean edges, at most a few tiny flaws.' },
      { id: 'LP', label: 'Lightly Played', min: 6, rawMult: 0.78, desc: 'A handful of minor flaws: light edge wear, small scuffs or scratches. Nothing severe.' },
      { id: 'MP', label: 'Moderately Played', min: 4.5, rawMult: 0.58, desc: 'Moderate wear: clear edge whitening, scratching or scuffing, maybe a small crease.' },
      { id: 'HP', label: 'Heavily Played', min: 2.5, rawMult: 0.38, desc: 'Major wear all over: heavy whitening, creases and many scratches, but still intact.' },
      { id: 'DMG', label: 'Damaged', min: 0, rawMult: 0.2, desc: 'Beyond played: big creases, tears, stains or wear that hurts the card itself.' },
    ],
    /** What walks up to the table: weighted buckets of wear score. */
    distribution: [
      { range: [9.5, 10], w: 10 },
      { range: [8.5, 9.5], w: 22 },
      { range: [8, 8.5], w: 14 },
      { range: [6, 8], w: 28 },
      { range: [4.5, 6], w: 14 },
      { range: [2.5, 4.5], w: 8 },
      { range: [1, 2.5], w: 4 },
    ],
    /** Corners, edges and surface stay within this many points of the worst one, so wear looks consistent. */
    maxSpread: 1.2,
    /** Centering score = 10 - |normal| * sd, floored at min. 9.5+ is 55/45 or better. */
    centering: { sd: 0.9, min: 5.5 },
  },

  /**
   * How much of each flaw is drawn at a given sub-score; values between rows are interpolated.
   * Rows sit on the tier boundaries (8 = NM/LP, 6 = LP/MP, 4.5 = MP/HP, 2.5 = HP/DMG).
   * nicks/cornerBlobs/scratches/scuffs/creases are counts; sizes are in card units (card is 250 wide).
   */
  flaws: {
    anchors: [
      { cond: 10, nicks: 0, nickLen: 0.8, nickDepth: 0.4, cornerBlobs: 0, cornerSize: 0.5, scratches: 0, scratchLen: 8, scratchOp: 0.2, scuffs: 0, creases: 0 },
      { cond: 9.5, nicks: 1, nickLen: 0.9, nickDepth: 0.45, cornerBlobs: 0.5, cornerSize: 0.6, scratches: 0.5, scratchLen: 10, scratchOp: 0.22, scuffs: 0, creases: 0 },
      { cond: 8, nicks: 5, nickLen: 1.3, nickDepth: 0.6, cornerBlobs: 3, cornerSize: 0.9, scratches: 2, scratchLen: 16, scratchOp: 0.28, scuffs: 0.3, creases: 0 },
      { cond: 6, nicks: 20, nickLen: 3, nickDepth: 1.1, cornerBlobs: 9, cornerSize: 1.9, scratches: 5, scratchLen: 30, scratchOp: 0.4, scuffs: 2, creases: 0 },
      { cond: 4.5, nicks: 36, nickLen: 4.5, nickDepth: 1.4, cornerBlobs: 14, cornerSize: 2.6, scratches: 10, scratchLen: 55, scratchOp: 0.5, scuffs: 4, creases: 0.6 },
      { cond: 2.5, nicks: 70, nickLen: 7.5, nickDepth: 2.2, cornerBlobs: 24, cornerSize: 4, scratches: 16, scratchLen: 85, scratchOp: 0.6, scuffs: 7, creases: 2.5 },
      { cond: 1, nicks: 110, nickLen: 11, nickDepth: 3.2, cornerBlobs: 36, cornerSize: 6, scratches: 24, scratchLen: 120, scratchOp: 0.7, scuffs: 10, creases: 4 },
    ],
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
    /** premium = how the market prices this company's slabs. usable = player can submit (Milestone 2). */
    companies: [
      { id: 'pra', name: 'PRA', premium: 1, usable: true, fee: 100, turnaroundDays: 4 },
      { id: 'cgx', name: 'CGX', premium: 0.9, usable: true, fee: 15, turnaroundDays: 21 },
      { id: 'buckett', name: 'Buckett', premium: 0.95, usable: false, fee: 0, turnaroundDays: 0 },
      { id: 'tagd', name: 'TAGD', premium: 0.85, usable: false, fee: 0, turnaroundDays: 0 },
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
    /** Each counter closes this fraction of the gap between current ask and floor. */
    concession: [0.3, 0.6] as [number, number],
    /** Re-roll a seller up to this many times if the ask is far beyond the player's cash. */
    affordRerolls: 3,
    affordFactor: 1.5,
  },

  marketplaces: [
    { id: 'ebuy', name: 'eBuy', w: 50, bias: 1.0, noise: 0.1, raw: true, minPrice: 0 },
    { id: 'fanatix', name: 'Fanatix', w: 20, bias: 1.04, noise: 0.07, raw: true, minPrice: 0 },
    { id: 'altt', name: 'Altt', w: 18, bias: 1.06, noise: 0.06, raw: false, minPrice: 50 },
    { id: 'gavel', name: 'Golden Gavel', w: 12, bias: 1.12, noise: 0.12, raw: false, minPrice: 150 },
  ],

  sales: {
    lookbackDays: 30,
    /** Raw sales generated per condition, so every condition filter has at least 5 comps. */
    rawPerTier: { NM: [6, 10], LP: [5, 8], MP: [5, 7], HP: [5, 6], DMG: [5, 6] } as Record<string, [number, number]>,
    gradeWeights: { 10: 6, 9: 14, 8: 8, 7: 4, 6: 2, 5: 1 } as Record<number, number>,
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

export type RarityId = keyof typeof CONFIG.rarities;
export type TierId = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
