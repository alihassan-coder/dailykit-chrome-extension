# Toolbelt logo

Toolbelt is one extension that holds a person's own power tools in Chrome's side panel. The shipped mark is
**Buckle-T** (v2, below). Round 1 ("Side rail") was **rejected**: it read as a bone or dumbbell and felt flat and
generic. Its files (`concept-*.svg`, `concepts.png`, `preview.png` in this folder) and its write-up below are kept
for the record.

## v2 (current): Buckle-T

Files in `v2/`:
- `concepts.png`: the four v2 directions at 128 / 48 / 32 / 24 / 16 on light (#ffffff) and dark (#202124), the
  32 and 16 masters enlarged, each one in a fake toolbar next to neighbour icons, and the mono version at 20 px.
- `preview.png`: the shipped icon at every size on light and dark, in a toolbar, the in-app 20 px mark and its mono
  form, and crops of the built options page and account gate.
- `<direction>/128.svg, 32.svg, 16.svg, mono.svg`, plus `buckle-t/48.svg` and `buckle-t/24.svg`.

### What "premium" meant here
Raycast, Arc, Linear, 1Password and the macOS Big Sur icons share three habits. They have one bold, readable form.
They use one consistent light source from above, which gives a top sheen, a rim light and a soft shadow under each
layer. And they use real materials instead of decoration: every gradient describes metal, leather or light. Bevels
stay subtle, depth comes from layering, and the boldness is spent in one place.

### The four directions
| Direction | Meaning | Verdict |
|---|---|---|
| **Buckle-T** (chosen) | A forged chrome buckle is the crossbar of a T, and the leather belt is its stem. The prong runs down into the one amber-lit hole: every tool fastened into one belt, and the one in use. | Clear T at every size, and unmistakably a belt. |
| Power buckle | A round buckle whose open top and prong make the power symbol: your kit, switched on. | Rejected: at 16–32 px it is just an on/off button. |
| Kit loop | A glowing belt on graphite, with its riveted tail hanging down as a T. | Rejected: it reads as a collar tag or a necktie, and "dark plate with one acid accent" is generic. |
| Carabiner | An asymmetric clip locked through the belt: any tool, clipped on, always with you. | Rejected: strong at 128, but the tilted shape goes soft at 16 and reads as a "D" or "J" in mono. |

Killed along the way: a side-release (quick-release) buckle that read as a USB plug, and a horizontal
"bolt prong" buckle that read as a "0" with a cable. The first Buckle-T had pill-shaped openings that looked like eyes
at small sizes. They became thin slits, and the frame was squared into a forged buckle, so it is no longer a
symmetric pill.

### Construction (128 grid; the plate is 96 at 16 with r 22, the rest is transparent padding)
- **Plate:** blue enamel, lit from the top (#7290FF → #4467F5 → #1F33B0), with a top sheen, a 1.5 px rim light
  that fades to a darker bottom edge, and a soft drop shadow.
- **Strap (the T's stem):** x 49–79, running from behind the buckle off the bottom edge. Navy leather shaded like a
  cylinder, with a faint grain, amber saddle stitching 4.6 px in from each edge, and three punched holes.
- **Buckle (the T's crossbar):** a forged frame at x 24–104, y 24–60, outer r 9, with a 10 px bar and a 16 px
  opening. It is brushed chrome lit from above: a white top face, a horizon line, a cool lower half, a specular
  streak, and a dark bevel along the lower edge. It casts a shadow on the strap.
- **Prong:** an 8 px chrome bar hinged on the top bar by a rolled cap. It rests on the bottom bar and its tip
  darkens as it enters the first hole. That hole has an amber rim and glow: the one accent, "the tool in use".

### Small sizes (each is a hand-fitted master on whole pixels; nothing is downscaled)
| Size | Plate | Buckle | Slit | Strap | Prong | Accent |
|---|---|---|---|---|---|---|
| 48 | the 128 master, cropped to a 1 px margin | full detail | | | | |
| 32 | full bleed, r 7 | 24×10, bars 3–4 | 2 px | 8 px, 1 px amber stitches | 2 px | amber 2×2 hole |
| 24 | full bleed, r 5.5 | 18×8 | 2 px | 8 px, stitches | 2 px | amber 2×2 hole |
| 16 | full bleed, r 3.5 | 14×6, solid white | 1 px | 6 px navy | 2 px | amber 2×2 hole |

At 16 px the stitching, chrome and shadows are gone. What is left is a white buckle bar, a navy stem, a white prong
and one amber hole: still a T, and still a belt. The plate carries the contrast on both #ffffff and #202124.

### In-app mark
`packages/ui/src/ToolbeltMark.tsx` draws the mark on the 20 grid: a 16×7 buckle with a 1 px slit, a 6 px strap, a
2 px prong into an amber 2×2 hole, a plate sheen and a chrome gradient. `<Logo/>` and `<BrandIcon mark="toolbelt"/>`
both use it, because the mark needs an even-odd slit and material gradients that the shared `ToolTile` does not
draw. `mono` draws the buckle, and the strap with its hole knocked out, in `currentColor`.
`brand-marks.json` → `toolbelt` is the same geometry in flat colours, for `scripts/render-icons.py`.

### Why Buckle-T
- **It means the name.** A buckle is what makes a belt a belt. Here the buckle and the strap literally form the T of
  Toolbelt, and the prong, locked into the lit hole, is "fastened, and in use".
- **One bold element.** The chrome buckle-T carries the icon. Everything else (stitching, grain, holes) is quiet
  material detail that falls away at small sizes without changing the silhouette.
- **It survives every size and both themes.** 2 px prong and strap structure at 16, crisp on whole pixels, with
  the plate supplying contrast. The mono form keeps the buckle and the punched hole.
- **Honest weaknesses.** At 16 px it is "a T with a buckle bar". The belt meaning needs 24 px and up. A T monogram
  is a crowded space (T-Mobile, Tesla), so the slit, prong and amber hole are what keep it ownable.

## Regenerating (v2)
- `apps/toolbelt/public/icon/{16,24,32,48,128}.png` are the `v2/buckle-t/*.svg` masters rendered at their exact
  size on a transparent background. `scripts/render-icons.py` renders them the same way where librsvg/Cairo are
  available.

---

## Round 1 (rejected): Side rail

Everything below is the original round 1 write-up. It is kept for the record and is **not shipped**.

- `concepts.png`: all three concepts at every size they were drawn for, on light and dark, with the 16 and 32 px
  masters enlarged and the mono versions.
- `preview.png`: the shipped icon (A) at 128 / 48 / 32 / 24 / 16 on light (#ffffff) and dark (#202124) toolbars,
  plus the in-app 20 px mark and its mono form.

Requirements come from `docs/research/design/01-extension-logo.md`:
- PNG at 16/24/32/48/128, and the 128 icon is 96 px artwork with 16 px of transparent padding.
- One icon has to work on both light and dark toolbars, because Chromium has no `theme_icons`.
- Plate #4467F5 with radius 25%, a white mark, and one amber (#FFC53D) element for "the tool in use".
- At 16 px, strokes are at least 2 px and gaps at least 1 px.
- None of these: letters, wrenches, toolboxes, puzzles, sparkles, gears, Chrome blue, rings as the main shape, or
  upright equal bars.

## Research: what makes the best marks distinctive

1. **One concrete idea tied to the product's core promise.** Raycast's icon is a keycap because the product is
   about the keyboard ([Raycast: A fresh look and feel](https://www.raycast.com/blog/a-fresh-look-and-feel)).
   1Password's mark is its keyhole, which its 2023 refresh moved to the front of the brand
   ([1Password brand refresh](https://1password.com/blog/1password-brand-refresh)). Toolbelt's promise is the side
   panel that holds your tools, so the mark should show that.
2. **A stylised piece of the product's own UI is a valid metaphor.** GNOME's guidelines list "a stylized version of
   a distinctive UI" next to physical objects. They also say an icon should be unique and avoid reused glyphs, and
   that it should be drawable "with only basic shapes"
   ([GNOME HIG: App icons](https://developer.gnome.org/hig/guidelines/app-icons.html)).
3. **Silhouette first, few shapes, few corners.** Microsoft asks for a "singular element using simple forms" with
   "as few shapes with as few corners as possible"
   ([Microsoft: App icon design](https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-design)).
   Vercel's mark is a single solid triangle that survives any size and either colour
   ([Vercel brand](https://vercel.com/geist/brands)).
4. **It must work in one colour.** Every reference mark (Vercel, Linear, Notion, 1Password) is still itself in
   flat monochrome. Here that means the knockout gaps, not colour, carry the structure, so the mono version is the
   same drawing in `currentColor`.
5. **Bleed one element off the plate edge.** It is the cheapest way to a silhouette nobody else has in the toolbar
   (research file, "Do" 7). Linear's diagonals do something similar: they cut the disc instead of sitting inside it.

## The three concepts

| | Concept | Meaning | Files |
|---|---|---|---|
| **A** | **Side rail** (chosen) | The side panel is the belt. Your tools sit on one rail docked to the edge, and the one in use (amber) slides out from behind it into the page. | `concept-a.svg` (128), `concept-a-48.svg`, `-32`, `-24`, `-16`, `concept-a-mono.svg` |
| B | Keeper buckle | One buckle fastens the belt, and the tile it holds is the tool you are using: everything you carry, locked to one place. | `concept-b.svg`, `concept-b-32.svg`, `concept-b-16.svg`, `concept-b-mono.svg` |
| C | Rack | Modular tiles clicked onto one strap: add or remove a tool, and the belt stays the same. | `concept-c.svg`, `concept-c-32.svg`, `concept-c-16.svg`, `concept-c-mono.svg` |

### Construction of A (128 grid, plate 16–112, r 24, top-to-bottom #5172F6 → #4467F5)
- **Rail:** white, x 72–88, running the full height of the plate (it bleeds off top and bottom like a docked panel).
- **Tool tiles:** two white tiles, 40×20 with r 7, at y 26 and y 82. They sit on the rail with a 4 px plate-colour
  knockout, so they read as clipped on.
- **Amber tile:** x 28–76, y 54–74. It passes behind the rail, which cuts a 4 px gap around it. The visible
  amber therefore ends in a straight edge, which reads as "pulled out of its slot".
- **Optical centre:** the mark spans x 28–100, centred on 64.

Each size is a separate master on whole pixels. Nothing is downscaled.

| Size | Plate | Rail | Tiles | Amber | Gap |
|---|---|---|---|---|---|
| 128 | 96 at 16, r 24 | 16 | 40×20 | 40 visible × 20 | 4 |
| 48 | 40 at 4, r 10 | 6 | 18×8 | 16 × 8 | 2 |
| 32 | full bleed, r 8 | 5 | 13×6 | 12 × 6 | 1 |
| 24 | full bleed, r 6, solid | 4 | 10×4 | 9 × 4 | 1 |
| 16 | full bleed, r 4, solid | 2 | 6×3 (no knockout) | 6 × 4 | 1 |

At 16 px the tiles merge with the rail into one white spine, because a 1 px knockout there would break the 2 px
rail. The amber is the heaviest shape, and every gap is 1 px.

**In-app mark:** `packages/ui/src/brand-marks.json` → `toolbelt` is the same drawing on the 20 grid used by
`ToolTile`. It has a 2 px rail at x 12, 8×3 tiles, and an 8×4 amber tile. `<Logo/>` and
`<BrandIcon mark="toolbelt" mono />` both draw from it as vector.

## Why A

- **It is the product, not just the name.** Toolbelt is a side panel holding tools. The mark is a rail docked to
  the edge, holding tools, with one pulled out. A says "one place" and "many tools", and shows the action of
  picking one. The buckle (B) only says "belt", and the rack (C) only says "several things".
- **It has a silhouette nobody else has.** The rail bleeds off the top and bottom of the plate, and the amber tile
  breaks the symmetry. At 16 px it is a white spine with an amber block. It does not read as a letter, a chart, a
  ring or a known glyph, and next to round or symmetric extension icons it is easy to spot.
- **It survives 16 px:** 2 px rail, 3–4 px tiles, 1 px gaps, all on whole pixels. It reads on #ffffff and #202124
  because the plate carries the contrast (#4467F5 is about 4.7:1 with white).
- **Mono keeps the idea.** In `currentColor` it is still a rail with one tile out, so it works in the
  panel header, menus and favicons.
- **What was rejected and why:**
  - **B** is clean and the most literally "belt", but a square ring with a tile inside reads as a stop or record
    button, or an "0", at 16 px. That is the ring risk the research warned about.
  - **C** reads as a dumbbell, a battery or a bar chart (three upright equal bars).

### Regenerating (round 1)
- Toolbar PNGs (`apps/toolbelt/public/icon/*.png`) are the A masters rendered at their exact size with a
  transparent background.
- `scripts/render-icons.py` renders them from these SVGs where librsvg/Cairo are available, and leaves Cairn's own
  icons on its brand-marks artwork.
