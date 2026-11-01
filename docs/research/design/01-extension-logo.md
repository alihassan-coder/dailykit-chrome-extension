# 01 · Toolbelt extension icon: requirements, small-size craft, and three directions

Questions:
1. What do the Chrome Web Store and Chrome require of an extension icon?
2. How do you design a mark that still reads at 16 px in the toolbar?
3. For "Toolbelt", which metaphor gives a meaningful mark, and how exactly should it be drawn?

Researched 2026-11-01. Primary sources are Chrome developer docs, Chromium source, the Microsoft Learn icon guidelines, the Apple HIG (read through its JSON data endpoint), GitHub Primer, IBM Carbon, Google's Material Symbols docs, and brand pages from Raycast, Linear and 1Password. Anything not checked against a primary source is marked **(unverified)**.

Context: the user rejected the four-squares mark as meaningless. Sketches A to D in `docs/design/logo-options.png` (buckle, T-strap, pouch, tools on a belt curve) were "not detailed enough". This file replaces them with constructed specs. I drew the three recommended directions as quick SVG and pixel tests in a scratch folder and checked them at 128 / 48 / 32 / 16 px on light (#DFE3E7) and dark (#1F1F1F) backgrounds. Those renders informed the notes below, but they are not final art.

---

## 1. Hard requirements (Chrome and Chrome Web Store)

| Rule | Source |
|---|---|
| A **128×128 PNG** icon is required in the ZIP. The **artwork is 96×96**, with **16 px of transparent padding on each side**. | [CWS: Supplying images](https://developer.chrome.com/docs/webstore/images) |
| "The image should work well on both light and dark backgrounds." | same |
| "Don't put an edge around the 128x128 image; the UI might add edges." | same |
| "If your icon is mostly dark, consider adding a subtle white outer glow." | same |
| "Avoid large drop shadows ... It's OK to use small shadows for contrast." A bottom bevel, if used, should be **4 px** deep. | same |
| "Make the icon face the viewer, rather than having built-in perspective." | same |
| Visual weight: square icons use 96×96 artwork. Squarish icons use 75–80% of the width. Circular icons are about **112 px** in diameter (85–90%). | same |
| An image with no alpha is put in a frame with a **12 px corner radius**. Always ship alpha. | same |
| Promo tiles: 440×280 small and 1400×560 marquee. "Avoid text", and they must work at half size. | same |
| Manifest `icons`: **128** (install and Web Store), **48** (`chrome://extensions`), **16** (favicon of extension pages). Other sizes are allowed; "Chrome will attempt to use the best size". | [Manifest icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons) |
| **WebP and SVG are not supported.** Use PNG. | same |
| The toolbar (action) icon is **16 DIPs**. Chrome recommends several sizes for 1.2×/1.5× screens. Without an exact match, Chrome scales the closest size. `setIcon` is for static images; "Don't use animated images". | [chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action) |
| **No light/dark toolbar variant.** Chromium does not support `action.theme_icons`. MDN's compat data was corrected in Oct 2024 after a report that the icon did not switch in Chromium 125. One icon must work on both toolbar themes. | [mdn/browser-compat-data#23151](https://github.com/mdn/browser-compat-data/issues/23151) |
| Badge text fits "only about four" characters. Use it for counts or states, not branding. | [chrome.action](https://developer.chrome.com/docs/extensions/reference/api/action) |

**Files to ship:** `icon-16.png`, `icon-24.png`, `icon-32.png`, `icon-48.png` and `icon-128.png`. The 16 and 32 px files are hand-fitted to whole pixels, and the 24 px file covers 1.5× screens. Wire them to both `icons` and `action.default_icon`.

## 2. Craft rules for marks that survive 16 px

What the platform guides say:
- **One metaphor, simple forms, no type.** Microsoft: illustrate the app "in a singular element using simple forms", use "no more than two metaphors ... If a single metaphor can be used, that's even better." It also says to avoid letters. Literal metaphors beat abstract ones, and "a good test ... is when users can tell what it represents without a label." [MS app icon design](https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-design)
- **Silhouette first.** Microsoft: "Use as few shapes with as few corners as possible", avoid "extremes of thick and thin shapes", and add detail only to the most prominent layer. (same)
- **Contrast on both themes.** Microsoft: "Make sure at least half of your icon passes a 3.0:1 contrast ratio on light and dark theme." Yellow fails on light backgrounds and red is hard on dark ones. (same)
- **Plating.** Transparent icons get theming for free. A plated icon (one drawn on a solid background shape) needs its own plate that works on both light and dark. [MS icon construction](https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction). Chrome has no theme icons, so **a solid plate is the simplest way to meet the CWS light-and-dark rule**.
- **Apple HIG (app icons):** "Embrace simplicity ... a minimal number of shapes". "Avoid extremely thin line weights and sharp corners, because they tend to lose detail ... at smaller sizes". Include text only when essential, and a single mnemonic letter is the only exception. "Keep your icon's features consistent across appearances." Use the light icon as the basis for dark. [HIG App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- **Apple HIG (interface icons):** optically centre asymmetric shapes, and "use the same stroke weight in every icon". [HIG Icons](https://developer.apple.com/design/human-interface-guidelines/icons)
- **Pixel alignment.**
  - Primer: "Align the outer edge of shapes to pixel boundaries", and keep a consistent stroke width of 1.5 px at 16 and 24. [Primer icon guidelines](https://primer.style/foundations/icons/design-guidelines)
  - IBM Carbon: draw on a 16×16 artboard with 1 px padding, use whole-pixel coordinates, expand strokes to outlines, and avoid centred strokes because they create half pixels. [Carbon v10 contribute icons](https://v10.carbondesignsystem.com/contributing/contribute-icons/). This is an older version of the guide; the current site moved the page.
- **Stroke weight changes with size.** Google: "For the image to look the same at different sizes, the stroke weight ... changes as the icon size scales." Use a lower grade for light-on-dark to reduce glare. [Material Symbols guide](https://developers.google.com/fonts/docs/material_symbols)

### Do
1. Start from the **16 px silhouette** and work up. If the shape fails at 16, no detail at 128 will save it.
2. Design **separate pixel-fitted masters at 16 and 32**. Never downscale the 128 file for them.
3. Every shape at 16 px is **at least 2 px** thick, and every gap is **at least 1 px**. Put outer edges on whole pixels.
4. Use **one focal element** in the accent colour. Everything else is one neutral (white on the plate).
5. Use a **plate** with ≥3:1 contrast against both #FFFFFF and #1F1F1F to #282828 (approximations of Chrome's light and dark toolbar). The candidate plate **#4467F5** measures 4.66:1 with white, 3.54:1 on #1F1F1F, 3.16:1 on #282828 and 3.61:1 on #DFE3E7 (calculated, WCAG formula). Chrome's real toolbar colours depend on the user's theme **(unverified exact values)**.
6. Build a **squint / blur test** into reviews. At 16 px, the mark must not read as a letter, digit, chart or another product's icon (see the lookalike list below).
7. Bleed one element off the plate edge (a strap running across the whole plate). It is the cheapest way to get a silhouette nobody else has.

### Don't
1. No text, initials or "T" lettermarks (MS and Apple both advise against text). Sketch B relied on this.
2. No rings or closed ovals as the main shape. In tests, a carabiner and a centred buckle both read as **"0" / "8" / "D"** at 16 px.
3. No three equal upright bars, which read as a bar chart or signal meter. Tools must **lean**.
4. No four-square grid. It is the Google apps launcher and the old sketch the user rejected.
5. No puzzle piece. It is Chrome's own Extensions button.
6. No sparkle or star. It is Gemini's and generic "AI".
7. No gear or wrench (reads as Settings), no toolbox (generic, see Chrome Toolbox below), and no Swiss-army cross (Victorinox trade dress).
8. No Chrome blue (#0B57D0 / #A8C7FA, Chrome WebUI's own primary from [cr_shared_vars.css](https://chromium.googlesource.com/chromium/src/+/main/ui/webui/resources/cr_elements/cr_shared_vars.css)). It would look like a Chrome system feature.
9. No large shadows, gradients steeper than a one-step ramp (MS: "limit your gradient ramps to only one or two steps"), and no perspective.

### What makes the reference marks memorable
These descriptions come from looking at the marks, not from the companies' own words, except where a quote is given. **(Visual descriptions are unverified against brand docs.)**
- **Raycast:** a slanted red (#FF6363) shape. Their redesign describes the icon as "a keycap. The keycap represents our focus on the app's keyboard accessibility." [Raycast: A fresh look and feel](https://www.raycast.com/blog/a-fresh-look-and-feel). Press page: "Do not alter its colors". [Raycast press](https://www.raycast.com/press). **Lesson:** a concrete object tied to the product's core promise, drawn with one shape and one colour.
- **1Password:** a keyhole in a circle on a blue disc. Brand guide is behind the [press kit](https://1password.com/press). **Lesson:** one literal object, centred, plated.
- **Linear:** a disc cut by parallel diagonals. Their redesign kept the brand blue out of neutral surfaces. [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui). **Lesson:** diagonals give motion at tiny sizes.
- **Notion** (a bold N on a cube), **Grammarly** (a G-like swirl on a green disc), **uBlock Origin** (a red shield), **Arc** (a rainbow arc). **Lesson:** every one is **one silhouette + one colour field**, and each is recognisable from shape alone at 16 px.

## 3. Metaphor evaluation for "Toolbelt"

| Metaphor | Meaning | 16 px result (tested where noted) | Lookalike / risk | Verdict |
|---|---|---|---|---|
| Four squares (old) | "apps" | clear | Google apps grid, Microsoft logo | Rejected by user |
| Centred buckle (A) | "belt" only, says nothing about tools | Tested: reads as **0/8** | many generic buckle icons | Improve (see Direction 2) |
| T-strap (B) | lettermark | ok | text in icon; looks like an upload/hammer glyph | Drop |
| Pouch with tools (C) | tools carried | busy; reads as a pen cup | pen-holder icons | Merge into Direction 1 |
| Tools on belt curve (D) | tools hanging | reads as Wi-Fi or a jellyfish | Wi-Fi glyph | Drop |
| **Tools tucked into a strap, leaning** | "your tools, carried, ready" | **Tested: reads (leaning strokes + band)** | bar chart if the tools stand upright | **Recommend (Dir. 1)** |
| **Buckle with strap through it + accent prong** | "one belt fastens everything" | Tested: buckle-ish, still a little "8" | generic buckle | **Recommend (Dir. 2)** |
| **Single loop holding one tool** | "clip a tool on", modular | Tested: strongest at 16 | pen / edit icon if the strap is lost | **Recommend (Dir. 3)** |
| Carabiner | "clip on" | Tested: reads as **0 / D** | keychain apps | Reject |
| Hex bit / bit holder | swappable bits = modules | hexagons read as a nut or Settings | Settings, honeycomb | Reject |
| Swiss-army knife | many tools | ok | Victorinox trade dress, cliché | Reject |
| Toolbox | many tools | ok | Google's "Chrome Toolbox" (2010s), many "toolbox" extensions | Reject |

**Name collisions (check before you commit; trademark search not done):**
- A "Toolbelt" Chrome extension for image, CSV and markdown tasks is described on [a third-party page](https://cooleasy.pages.dev/extensions/toolbelt.html) **(unverified listing)**.
- ["Dev Toolbelt" on Product Hunt](https://www.producthunt.com/products/dev-toolbelt): 4 dev tools in a popup.
- A construction-labour app called ToolBelt at toolbelt.work ([coverage](https://www.metalcoffeeshop.com/post/toolbelt-makes-it-easier-to-find-reliable-contractors-ready-for-project-recruitment)).
- Heroku's former "Heroku Toolbelt" CLI **(from memory, unverified)**.

None of these appear to use a strap-and-tools mark, but the **name itself is crowded**. Search the CWS listing name and trademark before you print anything.

## 4. Shared system for all directions

- **Canvas:** 128×128 with a 96×96 plate at (16,16) and corner radius **24** (25%). A superellipse plate is optional, but use a plain rounded rect if in doubt.
- **Plate:** Toolbelt cobalt **#4467F5** (≈ OKLCH 0.60 0.20 268, approximate conversion).
- **Neutral:** white #FFFFFF.
- **Accent:** signal amber **#FFC53D**, with 3.14:1 on the plate. Spend it on **exactly one element**: the tool or part that means "the one you're using". The accent never touches the plate edge.
- **Knockout gap** (plate colour, separating overlapping parts): 4 px at 128, 2 px at 48, 1–2 px at 32, 1 px at 16.
- **Size masters:**

| Size | Plate | Corner | Use |
|---|---|---|---|
| 128 | 96 at (16,16) | 24 | Store, install |
| 48 | 40 at (4,4) | 10 | `chrome://extensions` |
| 32 | full bleed 32 | 8 | Toolbar at 2× |
| 24 | full bleed 24 | 6 | Toolbar at 1.5× |
| 16 | full bleed 16 | 4 | Toolbar at 1×, favicon |

- **Monochrome variant** (in-panel header, favicon in a monochrome context, docs, print): drop the plate and draw the mark in one colour (`currentColor`). Keep every overlap as a knockout gap so it does not merge into a blob. Turn the amber element into a **solid fill** and the white elements into a **2/3-weight version** (at 128: tools 14 → 10, strap 18 → 12), so the "accent" still reads as the heaviest element.
- **Module sub-brands (for standalone sales):** keep the same plate, strap and construction. Swap the tool for a single module-specific head at ≥48 px:
  - colour picker = a dropper bulb
  - black-and-white = a half-filled disc
  - agent = a cursor arrow
  - Cairn = three stacked stones

  At 16 px every module shows the plain capsule tool. This is a proposal to discuss, not something researched.

## 5. Three directions, with construction specs

Coordinates are in the 128 canvas (origin top-left, y down). The 16 px maps use `.` for plate, `W` for white and `A` for amber. They were pixel-tested once and **a designer should refine them**; treat them as the starting master, not final art.

### Direction 1: "Holster" (recommended lead)
Three tools tucked into a belt strap, leaning, with the middle one in amber.
Story: *all your tools, carried in one belt; one is in your hand right now.*

128 px construction:
1. Plate as above.
2. **Tools:** three capsules (fully rounded ends), **14 wide**.
   - Before leaning: left x 30–44, y 40–100; middle x 54–68, y 26–100; right x 78–92, y 46–100. Centres are 24 apart.
   - Shear the group **18° (tops lean right)**, i.e. `translate(24 0)` then `skewX(-18)` in SVG, so the group sits optically centred.
   - Middle tool = amber. Outer tools = white.
3. **Knockout band:** plate colour, y 66–92, full plate width, drawn over the tools. It creates a 4 px gap above and below the strap.
4. **Strap:** white, y 70–88 (**18 tall**), x 16–112. It runs edge to edge of the plate, which is the signature silhouette.
5. The tool ends show **below** the strap (y 92–100), which tells the eye the tools are tucked in, not standing on it.

Strokes by size:

| Size | Tool | Strap | Gap |
|---|---|---|---|
| 128 | 14 | 18 | 4 |
| 48 | 5 | 7 | 2 |
| 32 | 4 | 6 | 2 |
| 16 | 2 (amber steps 2–3) | 2 | 1 |

At 32 the tops sit at y 3 (middle), 8 (left) and 10 (right), and each tool steps 1 px right for every 3 rows.

16 px master: two tools only, because three upright-ish bars read as a chart.
```
................
................
..........AA....
.........AAA....
.........AA.....
....WW..AAA.....
....WW..AA......
...WW..AAA......
...WW..AA.......
................
WWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWW
................
..WW..AA........
................
................
```
Risk: if the tools are drawn upright it becomes a bar chart, so the lean is **not optional**.
Monochrome: the strap stays full width, and tools and strap are separated by plate-coloured gaps.

### Direction 2: "Prong" (most belt-like)
A buckle with the strap running through it and the prong in amber.
Story: *one belt fastens everything.* The amber prong is "the tool in use".

128 px construction:
1. Plate.
2. **Strap:** white, x 16–112, y 54–74 (**20 tall**), edge to edge.
3. **Clearance:** plate-colour rounded rect x 36–92, y 30–98, r 16. This gives a 4 px gap around the frame.
4. **Frame:** white rounded-rect ring.
   - Outer x 40–88, y 34–94 (48×60), outer r 14.
   - Inner opening x 52–76, y 46–82 (24×36), inner r 3.
   - So the bars are **12 thick**.
5. **Strap inside the opening:** white x 52–76, y 54–74, so the strap visibly passes through.
6. **Prong:** amber capsule x 46–96, y 59–69 (**10 tall**, r 5). It starts on the left bar, crosses the opening, and rests on the strap tail.
7. **Next hole:** plate-colour circle, centre (103, 64), r 4, on the right-hand strap.

Strokes by size:

| Size | Frame bar | Strap | Prong | Gap |
|---|---|---|---|---|
| 128 | 12 | 20 | 10 | 4 |
| 48 | 5 | 8 | 4 | 2 |
| 32 | 3 | 6 | 3 | 1 |
| 16 | 2 | 4 | 2 | 1 |

16 px master:
```
................
................
.....WWWWWW.....
....WWWWWWWW....
....WW....WW....
....WW....WW....
WWW.WWWWWWWW.WWW
WWW.AAAAAAAAA.WW
WWW.AAAAAAAAA.WW
WWW.WWWWWWWW.WWW
....WW....WW....
....WW....WW....
....WWWWWWWW....
.....WWWWWW.....
................
................
```
Risk: the frame alone reads as "8". The strap stubs that bleed to the plate edge are what turn it into a buckle, so never crop them.
Monochrome: drop the plate. Use the frame plus a solid prong, with the strap stubs as short bars either side.

### Direction 3: "Loop" (strongest at 16 px; best base for module icons)
One belt loop on a strap with a single amber tool tucked through it.
Story: *clip on the tool you need.* The same construction gives every standalone module its own icon.

128 px construction:
1. Plate.
2. **Strap:** white, x 16–112, y 68–90 (**22 tall**).
3. **Loop clearance:** plate-colour rounded rect x 46–82, y 56–102, r 10.
4. **Loop:** white rounded-rect ring.
   - Outer x 50–78, y 60–98, r 8.
   - Inner opening x 58–70, y 68–90.
   - So the bars are **8 thick**, and the opening shows the plate.
5. **Tool:** amber capsule, **14 wide**, 76 long, centred on (64, 64), rotated **18° clockwise** (top to the right, matching Direction 1). It sits over the loop's top and bottom bars, so it reads as held by the loop.

Strokes by size:

| Size | Tool | Strap | Loop bar | Gap |
|---|---|---|---|---|
| 128 | 14 | 22 | 8 | 4 |
| 48 | 5 | 8 | 3 | 2 |
| 32 | 4 | 6 | 2 | 1 |
| 16 | 2–3 | 2 | (loop dropped) | 1 |

At 16 px the loop disappears and the tool simply passes behind the strap.

16 px master:
```
................
................
..........AA....
.........AAA....
.........AA.....
........AAA.....
........AA......
.......AAA......
................
WWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWW
................
.....AAA........
.....AA.........
................
................
```
Risk: without the strap it is a pencil/"edit" glyph. The strap is mandatory.
Monochrome: tool solid, strap solid, with a 1 px knockout where they cross.

### Recommendation
- Take **Direction 1 (Holster)** forward as the bundle icon. It is the only one that says both "belt" and "many tools".
- Use **Direction 3 (Loop)** as the template for standalone module icons, so the family is visibly related.
- Keep **Direction 2 (Prong)** as the alternate if the user prefers an object-first, more "hardware" look.
- Before choosing, show all three in the real toolbar next to 1Password, uBlock and Grammarly, on light and dark Chrome themes, at 100% and 150% zoom.

## Open questions
- The exact colours of Chrome's light and dark toolbar under the 2023+ refresh, and under user themes. Contrast was checked against #1F1F1F (Chrome WebUI dark surface fallback, [cr_shared_vars.css](https://chromium.googlesource.com/chromium/src/+/main/ui/webui/resources/cr_elements/cr_shared_vars.css)) and #282828 / #DFE3E7 (approximations, **unverified**).
- Whether the UI accent (the panel's cobalt) should become #4467F5 so the icon and UI match, or stay separate. This is the user's decision.
- Trademark and CWS name search for "Toolbelt" (not done).
