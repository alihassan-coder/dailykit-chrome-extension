# 04: User-customizable theming at scale

Researched 2026-10-31. Tailwind CSS 4.3, DTCG Design Tokens spec 2025.10.

## What serious products do

| Product / system | Inputs the user (or theme author) controls | Mechanism | Source |
| --- | --- | --- | --- |
| **Linear** | **3 values: base colour, accent colour, contrast** (previously 98 hand-set variables per theme) | Generates the full surface/elevation/text scale in **LCH** so perceived lightness is uniform. The contrast input yields high-contrast themes automatically. | https://linear.app/now/how-we-redesigned-the-linear-ui |
| **Radix Themes** | `accentColor`, `grayColor`, `radius` (none/small/medium/large/full), `scaling` (90–110%), `panelBackground`, appearance | Data attributes on the theme root. `[data-radius='large'] { --radius-factor: 1.5 }`, `--radius-3: calc(6px * var(--scaling) * var(--radius-factor))`, `[data-scaling='105%'] { --scaling: 1.05 }` | https://www.radix-ui.com/themes/docs/theme/overview, token CSS: https://github.com/radix-ui/themes/tree/main/packages/radix-ui-themes/src/styles/tokens |
| **shadcn/ui** | Semantic tokens: `--background/--foreground`, `--primary/--primary-foreground`, … `--radius` | Plain CSS vars in `:root` / `.dark`, mapped to utilities with `@theme inline { --color-primary: var(--primary); }`, values in `oklch()` | https://ui.shadcn.com/docs/theming |
| **DTCG spec 2025.10** (first stable, 2025-10-28) | n/a: an interchange format | JSON tokens with aliases, theming/multi-brand, OKLCH and Display P3 support | https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/, https://www.designtokens.org/tr/2025.10/ |

The common pattern: **a few user-facing knobs → a generated set of semantic CSS variables → components that use only semantic tokens.** Nobody lets users edit 100 variables directly.

## Tailwind v4 mechanics that matter

Source: https://tailwindcss.com/docs/theme

- Use `@theme` for tokens that should become utilities and `:root` for plain vars. Theme vars must be top-level, not nested in selectors or media queries.
- `@theme inline { --color-surface: var(--dk-surface); }` makes the utility reference your runtime variable directly. **This is the key piece for runtime theming:** the utility class stays `bg-surface`, and the value changes when `--dk-surface` changes.
- `--color-*: initial` (or `--*: initial`) removes Tailwind's default palette and scales. Recommended: then `bg-blue-500` *does not exist*, so every component has to go through the theme, which is both the themability guarantee and the anti-generic guarantee.
- `--spacing` is a single variable that drives the whole spacing scale, so density is one variable.
- Namespaces: `--color-*`, `--font-*`, `--text-*`, `--font-weight-*`, `--tracking-*`, `--leading-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--animate-*`, and others.
- Dark mode: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` (https://tailwindcss.com/docs/dark-mode).

## Recommended token architecture for DailyKit

**Layer 1: user theme (stored, synced, small)**

```ts
type UserTheme = {
  mode: 'light' | 'dark' | 'system';
  accent: string;          // any colour, stored as oklch
  neutral: string;         // tint for greys (Linear's "base")
  contrast: number;        // 0..1
  radius: 'none'|'sm'|'md'|'lg'|'full';   // -> --dk-radius-factor
  density: 'compact'|'cozy'|'roomy';      // -> --dk-density (0.85 / 1 / 1.15)
  scale: number;           // text/UI scale, 0.9..1.2 (also the rem-free answer from 03)
  fontSans: string; fontMono: string;     // from a bundled, curated set
  motion: 'full' | 'reduced';
}
```

**Layer 2: generated semantic variables (written as an inline `style` on the theme root)**

- Variables: `--dk-bg`, `--dk-surface-1..3`, `--dk-fg`, `--dk-fg-muted`, `--dk-border`, `--dk-accent`, `--dk-accent-fg`, `--dk-accent-subtle`, `--dk-danger`, `--dk-warning`, `--dk-success`, `--dk-ring`, `--dk-radius-factor`, `--dk-density`, `--dk-scale`, `--dk-font-sans`, `--dk-font-mono`.
- Generate the scales **in TypeScript** (OKLCH maths, e.g. with `culori`), not with CSS relative-colour syntax. You need WCAG contrast checks in the theme editor anyway, and computing in JS lets you **clamp unreadable combinations**. `color-mix()` and `oklch()` are safe in CSS (Chrome 111 / Firefox 113 per MDN BCD) for small derived states such as hover = `color-mix(in oklch, var(--dk-accent), black 8%)`.
- Ship defaults as one or more **named presets** (DailyKit's own look) and expose import/export as DTCG-style JSON. Users can share themes, and modules can never define their own colours.

**Layer 3: Tailwind mapping (in `packages/ui`)**

```css
@theme { --*: initial; }   /* no stock palette, no stock radii/shadows */
@theme inline {
  --color-bg: var(--dk-bg);  --color-surface: var(--dk-surface-1); /* ... */
  --color-accent: var(--dk-accent); --color-accent-fg: var(--dk-accent-fg);
  --radius-sm: calc(4px * var(--dk-radius-factor));
  --radius-md: calc(8px * var(--dk-radius-factor));
  --spacing: calc(4px * var(--dk-density));
  --text-sm: calc(13px * var(--dk-scale)); /* px, not rem (see 03) */
  --font-sans: var(--dk-font-sans);
}
```

**Applying at runtime**

- Store the theme in `chrome.storage.local` (and in the sync payload).
- Each surface subscribes to `storage.onChanged` and rewrites the variables: extension pages on `document.documentElement`, content-script UIs on the **shadow container**, never on the host page. Every open tab updates instantly, with no rebuild.
- Respect `prefers-color-scheme` when `mode: 'system'` and `prefers-reduced-motion` when `motion` is unset.

**Per-module accent (optional):** a module may *read* `--dk-accent` but must not set colours. If you want module identity, add a single `--dk-module-hue` that the generator turns into a subtle tint.

## Avoiding the "generic / AI-generated" look

This is design judgement, not documented fact.

- The generic look mostly comes from untouched defaults: Inter or system font, neutral-zinc greys, `rounded-xl` everywhere, `shadow-md` cards, indigo/violet accent, centred hero cards, emoji icons. Removing Tailwind's defaults (`--*: initial`) forces deliberate choices.
- Pick a **distinctive bundled typeface pair**, a **characteristic radius** (very small, or none), **tinted neutrals** (Linear's base colour), borders over shadows, tight information density as the default, and one custom icon set (Cairn already has `core/icons.js`).
- Keep a `/dev/theme-lab` extension page that renders every component under every preset, for visual review.

## Recommendation

Use a three-layer token system:

1. A small `UserTheme` object (mode, accent, neutral, contrast, radius, density, scale, fonts).
2. A TS generator that writes OKLCH semantic `--dk-*` variables with contrast clamping.
3. A Tailwind v4 `@theme inline` mapping with **all default tokens cleared**.

Apply the variables at runtime on the page root or the shadow container via `storage.onChanged`. This is the model Linear and Radix Themes use, implemented with shadcn-style semantic tokens.
