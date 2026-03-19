# Implementation Plan Reference

## Phase 1: Foundation

1. Set up route layout and shared UI primitives.
2. Set up Tailwind theme tokens for light/dark mode and enforce no-gradient design.
3. Define domain types (`Trade`, `Position`, `PortfolioSummary`).
4. Create portfolio calculation utilities with unit tests.
5. Add local persistence adapter (local-first).

## Phase 2: Core Portfolio

1. Build trade entry flow with validation.
2. Build holdings list screen.
3. Build summary cards for invested, market value, and P/L.
4. Add empty, loading, and error states.

## Phase 3: Watchlist and Insights

1. Add watchlist CRUD and symbol search.
2. Integrate quote source abstraction layer.
3. Add per-symbol performance breakdown.
4. Add lightweight filters/sorting.

## Phase 4: Hardening

1. Add migration strategy for persisted data.
2. Improve test coverage for domain math and reducers.
3. Improve performance (memoization, render boundaries).
4. Prepare sync-ready interfaces for future backend integration.

## Suggested App Structure

- `app/` route entry points and screen composition.
- `src/features/portfolio/` portfolio screens, hooks, and feature state.
- `src/features/watchlist/` watchlist modules.
- `src/domain/` typed models and business rules.
- `src/lib/` shared helpers and adapters.
- `src/components/` reusable UI building blocks.

## Delivery Rule

Ship in small vertical slices and run `bun run typecheck` after each slice.
