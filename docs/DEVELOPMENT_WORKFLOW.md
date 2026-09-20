# Development Workflow

## Starting a Session

1. Read `agent-progress.md` (project root) — see exactly what was last done and what's next.
2. Open the current phase file in `docs/phases/`.
3. Check `npm run type-check` passes before making changes.

## During a Session

- Work **one task** from the current phase file at a time.
- Keep `core/` logic free of Electron/React imports — always.
- Every new analysis = one parameterized DuckDB SQL function in `core/analytics/`.
- Test new code against all 3 sample CSVs in `test-data/`.

## Ending a Session

- Run `npm run type-check` and `npm run build` — both must pass.
- Update `agent-progress.md`: what got done, any blockers, what's next.
- Check off completed tasks in the phase file (`- [x]`).
- When a phase is fully done, update its phase file with actual results.

## Running the App

```bash
# Development (Electron + Vite together — Electron waits for Vite automatically)
npm run dev

# Verify types only
npm run type-check

# Production build
npm run build
```

## When Something Feels Too Big

Split it until it's a single TypeScript function with one clear input and one clear output.  
If you can't state "input X → output Y" in one line, it's not scoped yet.

## Key Decisions Already Made

| Decision | Rationale |
|---|---|
| DuckDB for all analytics | Fast columnar SQL, works fully offline, no server needed |
| Rule engine (not AI) drives analysis selection | Deterministic, explainable, no hallucinations |
| `core/` is framework-free | Keeps analytics testable and reusable |
| No cloud APIs | Core project constraint — offline-first |
| Electron (not Tauri) | Node.js native DuckDB bindings work out of the box |
