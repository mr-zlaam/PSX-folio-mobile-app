# Done Checklist Reference

Use this checklist before declaring a task complete.

## Build and Tooling

- Commands use `bun` only.
- No `npm`, `yarn`, or `pnpm` usage introduced.
- `bun run typecheck` passes.

## Code Quality

- File size stays under 250 lines where practical.
- Naming is descriptive and consistent.
- No dead code or unused imports in touched files.
- Business logic is separated from presentational UI.

## Product Correctness

- Trade inputs are validated (`symbol`, `side`, `quantity`, `price`, `fees`, `date`).
- Portfolio math behavior is covered for new/changed logic.
- Edge states are handled (empty, invalid input, zero-invested scenarios).

## UI Consistency

- Colors come from Tailwind theme tokens.
- No explicit color values are introduced in component/style files.
- Any newly needed color is added in `tailwind.config.js` before usage.
- No inline hex/rgb/hsl color usage in JSX/TS/TSX/CSS.
- No gradients are used anywhere (`bg-gradient-*`, `expo-linear-gradient`, or gradient assets).
- Light mode uses white as main background, dark purple for highlights, and `#28282b` for text.
- Dark mode uses dark purple as main background and white as primary text color.
- Red buttons are only used for destructive/danger actions.
- Non-destructive buttons use purple or white variants only.
- Views are responsive enough for phone layouts.

## Documentation Sync

- If workflow or constraints changed, update `AGENTS.MD` and relevant skill reference files.
