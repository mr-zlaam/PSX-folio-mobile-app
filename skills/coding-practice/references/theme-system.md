# Theme System Reference

## Design Constraints

- No gradients anywhere in the project.
- Support exactly two modes: `light` and `dark`.
- Keep visual language simple and consistent with a compact palette.

## Palette Tokens

- `brand.white`: `#FFFFFF`
- `brand.purple`: `#140A26`
- `brand.red`: `#DC2626`
- `text.light`: `#28282b` (primary text in light mode)

## Mode Mapping

`light` mode
- Main background/surfaces: white
- Highlight/accent: dark purple
- Primary text: `#28282b`

`dark` mode
- Main background/surfaces: dark purple
- Primary text/icons: white
- Accent contrast: white where needed

## Button Rules

- Use red only for destructive actions (delete, remove, irreversible actions).
- Use purple or white button variants for all non-destructive actions.

## Implementation Notes

- Use `darkMode: "class"` in Tailwind config.
- Use semantic token naming in classes (`bg-app-bg`, `text-app-text`, `bg-button-danger`).
- Keep all color values in `tailwind.config.js`; do not hardcode colors in components.
- If a new color is needed:
  1. add it to `tailwind.config.js`
  2. use only the tokenized class name in UI code
