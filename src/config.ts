// Every tunable lives here. Game logic reads from CONFIG; nothing is hard-coded elsewhere.

export const CONFIG = {
  startingCash: 1000,

  show: {
    dayLengthSec: 240,
    /** Hidden number of customers who will walk up in a day (inclusive range). */
    customers: [8, 14] as [number, number],
    /** Seconds between one customer leaving and the next arriving. */
    walkUpDelaySec: [2, 5] as [number, number],
  },

  /** Near Mint raw value range per rarity, and how often each rarity walks up. */
  rarities: {
    common: { label: 'Common', symbol: '●', value: [5, 20], w: 30, gradedShare: 0.15 },
    uncommon: { label: 'Uncommon', symbol: '◆', value: [25, 70], w: 35, gradedShare: 0.25 },
    rare: { label: 'Rare', symbol: '★', value: [90, 260], w: 25, gradedShare: 0.4 },
    ultra: { label: 'Ultra Rare', symbol: '✦', value: [350, 900], w: 10, gradedShare: 0.5 },
  },

  condition: {
    /** Raw condition tiers by hidden true condition (1-10). rawMult is vs Near Mint price. */
    tiers: [
      { id: 'NM', label: 'Near Mint', min: 8, rawMult: 1 },
      { id: 'LP', label: 'Lightly Played', min: 6, rawMult: 0.78 },
      { id: 'MP', label: 'Moderately Played', min: 4.5, rawMult: 0.58 },
      { id: 'HP', label: 'Heavily Played', min: 2.5, rawMult: 0.38 },
      { id: 'DMG', label: 'Damaged', min: 0, rawMult: 0.2 },
    ],
    /** What walks up to the table: weighted buckets of true condition. */
    distribution: [
      { range: [9.5, 10], w: 8 },
      { range: [8.5, 9.5], w: 24 },
      { range: [8, 8.5], w: 14 },
      { range: [6, 8], w: 28 },
      { range: [4.5, 6], w: 14 },
      { range: [2.5, 4.5], w: 8 },
      { range: [1, 2.5], w: 4 },
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
    /** Walk-away line = floor - this fraction of true value. */
    walkLineFracOfTrue: 0.2,
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
    count: [14, 22] as [number, number],
    lookbackDays: 30,
    rawTierWeights: { NM: 35, LP: 25, MP: 12, HP: 6, DMG: 3 } as Record<string, number>,
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
