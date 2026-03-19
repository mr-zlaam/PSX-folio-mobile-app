---
name: coding-practice
description: "PSX portfolio engineering workflow for this repository. Use when implementing or refactoring Expo/React Native/NativeWind code here. Enforce bun-only package management, file size and naming discipline, typed domain logic, theme-token-only styling, and `bun run typecheck` after each change batch."
---

# Coding Practice (PSX Portfolio)

## Use This Skill When

- Editing any app code in this repository.
- Building portfolio, trade, watchlist, or analytics features.
- Refactoring UI/components/hooks/services related to PSX domain behavior.

## Non-Negotiable Rules

1. Always use `bun` as the package manager.
2. Use only `bun` commands (`bun install`, `bun add`, `bun remove`, `bun run`, `bunx`).
3. Never use `npm`, `yarn`, or `pnpm` commands in this repo.
4. Run `bun run typecheck` after every meaningful code-change batch.
5. Stop and fix type/lint issues before moving to the next batch.

## Project Context

- App goal: Pakistan Stock Exchange (PSX) portfolio manager.
- Primary currency: PKR.
- Local timezone for market-related logic: `Asia/Karachi`.
- Symbols must be normalized to uppercase.

## Engineering Workflow

1. Inspect affected files and identify refactor opportunities before editing.
2. Keep each file under 250 lines; split mixed responsibilities into reusable modules.
3. Prefer typed props, small pure components, and explicit interfaces.
4. Keep portfolio math and business logic outside UI render files.
5. Remove dead code and unused imports while touching files.

## Theme and Styling Rules

- Define all theme colors in `tailwind.config.js`.
- Use only theme tokens in class names.
- Never use any color explicitly in components.
- If a new color is required, define it in `tailwind.config.js` first, then use the generated token class.
- Do not use inline hex/rgb/hsl colors in JSX/TS/TSX/CSS.
- No gradients anywhere in this project.
- Never use `bg-gradient-*`, `expo-linear-gradient`, or gradient assets.
- UI modes:
  - `light`: white as main surface, dark purple as highlight, `#28282b` as primary text.
  - `dark`: dark purple as main surface, white as primary text.
- Color policy:
  - White + dark purple are the main UI colors.
  - Red is only for destructive/danger actions.
  - Non-destructive buttons must use purple or white variants.

## Required References

- Portfolio formulas and data contracts: `references/portfolio-domain.md`
- Feature rollout and architecture slices: `references/implementation-plan.md`
- Completion and quality gates: `references/done-checklist.md`
- Theme tokens and mode behavior: `references/theme-system.md`

Load only the reference file needed for the current task to keep context lean.
