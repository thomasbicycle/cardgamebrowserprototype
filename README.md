# Card Show Hustle (prototype)

Browser prototype of a card-dealer game. Mobile-first, portrait.

```bash
npm install
npm run dev     # play locally
npm test        # core logic tests
npm run build   # static build in dist/ (wraps with Capacitor as-is)
```

- `src/config.ts`: every tunable.
- `src/core/`: game logic, no DOM. State is plain JSON and all randomness is seeded.
- `src/ui/`: Preact screens and SVG card rendering.
- `src/platform/`: storage (later audio, ads) behind small adapters.

Add `?debug=1` to the URL, or tick the box on the title screen, to see hidden values.

Milestones: 1 buy loop (done) · 2 grading, wholesale, inventory · 3 display case · 4 calendar, drift, recap, save · 5 polish, fake ads.
