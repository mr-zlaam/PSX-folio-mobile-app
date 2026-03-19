# PSX Portfolio Engineering Guide

## Mission

Build and maintain `psx-portfolio`: a Pakistan Stock Exchange (PSX) portfolio manager app for tracking holdings, trades, valuation, and performance on mobile.

## Non-Negotiables

1. Always use `bun` as the package manager.
2. Use only `bun` commands: `bun install`, `bun add`, `bun remove`, `bun run <script>`, `bunx <tool>`.
3. Do not use `npm`, `yarn`, or `pnpm` commands in this repository.
4. Run `bun run typecheck` after each meaningful change batch.
5. Stop and fix type/lint issues before continuing.

## Product Context

- Market: Pakistan Stock Exchange (PSX).
- Primary currency: PKR.
- Local market timezone: `Asia/Karachi`.
- Instrument symbols should be normalized to uppercase.

## MVP Focus

1. Holdings screen: current positions and cost basis.
2. Trades ledger: buy/sell entries with date, quantity, price, and fees.
3. Portfolio summary: invested amount, market value, unrealized/realized P/L, and return %.
4. Watchlist: key symbols and latest price snapshot.
5. Persistence: local-first storage with clear migration path for cloud sync.

## Engineering Workflow

1. Inspect affected files and identify refactor opportunities before editing.
2. Keep files under 250 lines; split large responsibilities into smaller components/utilities.
3. Use clear names for variables, functions, components, and hooks.
4. Prefer typed, pure, and reusable units over large stateful components.
5. Remove dead code and unused imports while touching files.

## UI and Theme Rules

- Define theme colors in `tailwind.config.js` and reference them by tokens only.
- Never use any color explicitly in component files.
- If a new color is needed, add it first to `tailwind.config.js` and then use the token/class name.
- No gradients anywhere in the project.
- Never use gradient utilities or APIs (`bg-gradient-*`, `expo-linear-gradient`, gradient images).
- Do not use inline hex/rgb/hsl colors in JSX/TS/TSX/CSS.
- Example policy: add `colors.card.border = "#XXXXXX"` in Tailwind, then use `border-card-border` in classes.
- Two supported UI modes: `light` and `dark`.
- Core brand colors:
  - `brand.white`: `#FFFFFF`
  - `brand.purple`: `#140A26`
  - `brand.red`: `#DC2626`
  - `success.green`: `#16A34A` (allowed only for positive profit/return indicators)
- Light mode behavior:
  - Main surfaces: white
  - Highlight/accent: dark purple
  - Primary text: `#28282b`
- Dark mode behavior:
  - Main surfaces: dark purple
  - Primary text/icons: white
  - Accent/surface contrast: white where needed
- Button behavior:
  - Use red only for destructive or dangerous actions.
  - Use purple or white for all non-destructive buttons.
- Profit/return behavior:
  - Positive values may use `success.green`.
  - Negative values use `brand.red`.
  - Zero values use neutral text tokens.

## Data and Calculation Rules

- Keep money and fee calculations deterministic and explicit.
- Represent and validate all required trade inputs (`symbol`, `side`, `quantity`, `price`, `date`, `fees`).
- Keep calculation logic separate from UI components.
- Add lightweight tests for any non-trivial portfolio math.

## Definition of Ready for Coding

- Project rules are documented in this file and mirrored in `skills/coding-practice`.
- Skill metadata and references are updated for PSX scope.
- Commands and examples use `bun` only.
