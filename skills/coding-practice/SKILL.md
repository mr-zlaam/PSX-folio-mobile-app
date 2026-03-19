---
name: coding-practice
description: "Apply the Easy Quran engineering workflow for code changes in this repository. Use when implementing or refactoring React Native/Expo/NativeWind code here and enforce these constraints: run `bun run typecheck` after each change batch, keep files under 250 lines by splitting components, keep naming consistent, and use only Tailwind theme tokens for colors (light/dark based on #fff and #28282b)."
---

# Coding Practice

## Workflow

1. Inspect the affected files and identify refactor opportunities before editing.
2. Split large or mixed-responsibility code into reusable components.
3. Keep each file below 250 lines; extract components or utilities when needed.
4. Use consistent and descriptive variable, function, and component names.
5. Run `bun run typecheck` after every code-change batch.
6. Stop and fix type/lint issues before proceeding.

## Theme Rules

- Define all app colors in `tailwind.config.js`.
- Use only theme color tokens in class names.
- Do not use inline hex/rgb/hsl colors in JSX/TS/TSX/CSS.
- Use the two base colors only:
`#fff` for light surfaces / dark text inverse and `#28282b` for dark surfaces / light text inverse.
- Prefer semantic token names (`background`, `foreground`, `background-inverse`, `foreground-inverse`) over direct palette names.

## Code Quality Rules

- Prefer typed props and small pure components.
- Remove dead code and unused imports during edits.
- Keep components focused on one responsibility.
