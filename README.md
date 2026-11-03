# Canvas Studio Dark Mode

A carefully crafted dark theme for **Power Apps canvas Studio** and the maker portal, delivered as a Chrome / Edge extension (Manifest V3).

- Every part of Studio's chrome goes dark: command bar, formula bar (Monaco), tree view, Insert / Data / Variables panes, properties pane, dialogs, menus, tooltips, settings, Copilot and comments panes.
- **Your app is never recoloured.** The canvas that renders the app you are designing is excluded from every rule, so what you see is what your users get.
- Accessible by design: every text/surface pairing the theme produces is checked against WCAG 2.1 AA (AAA in the high-contrast setting), focus rings are preserved, Windows High Contrast mode is respected, and the extension never changes the DOM structure or ARIA of the page.
- Zero telemetry, no accounts, no network requests other than fetching Studio's own stylesheets.

## Install (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder (the one containing `manifest.json`).
4. Open <https://make.powerapps.com> and edit any canvas app. Studio turns dark immediately; use the toolbar popup or **Alt+Shift+D** to toggle.

A packaged zip for store submission is produced by `npm run package` (lands in `dist/`).

## Settings

Open the toolbar popup or the full options page (`All settings`).

| Setting | What it does |
| --- | --- |
| Dark mode | Master switch (also **Alt+Shift+D**, configurable at `chrome://extensions/shortcuts`). |
| Appearance | *Always dark*, or *Follow system* (dark only while your OS colour scheme is dark). |
| Surface | *Dim*, *Dark* (Fluent UI's dark theme greys) or *Black* for OLED-style surfaces. |
| High contrast text | Brighter text and stronger borders targeting WCAG AAA. Turns on automatically when the OS asks for more contrast. |
| Dark canvas backdrop | Darkens the dotted work area around the app. Turn it off to keep the light backdrop and judge your app against a neutral frame. |
| Adapt two-tone icons | Lightens dark neutral strokes in Studio's control icons; coloured parts are never changed. |
| Maker portal pages | Also theme Home, Apps, Tables, Flows and the other make.powerapps.com pages. |

Settings sync with your browser profile and apply instantly to open tabs.

## How it works

Studio mixes several styling systems, so a single trick would never cover all of it. The extension layers four mechanisms, all computed in the content script with no round trips:

1. **Fluent UI v9 design tokens.** Studio's modern UI reads colours from `--colorNeutralBackground1`-style custom properties. The extension redefines all 348 colour tokens with Fluent's own dark-theme mapping, re-derived for Power Apps' purple brand ramp and the status/persona palettes (`tools/gen-tokens.mjs`). Tokens that Studio uses in the "wrong" role (a surface token as a text colour) are retargeted to a legible variant.
2. **CSSOM rewriting.** Every stylesheet (Fluent v8 merge-styles, Aphrodite, Griffel, Monaco, Studio's own CSS, including cross-origin files fetched through CORS or the service worker) is walked rule by rule. Each colour-bearing declaration is re-emitted with its dark counterpart, preserving selectors, media queries and `!important`, and variables that hold colours get typed variants so `var()` usages map correctly by role (background, text, border, shadow). A MAIN-world hook reports `insertRule` traffic so CSS-in-JS updates are picked up without polling.
3. **Inline colours.** Elements with colours in their `style` attribute or SVG `fill` / `stroke` attributes receive `--capd-i-*` variables and a marker attribute; static rules apply them. The page's own declarations are never removed, so turning the theme off is lossless.
4. **Hand-tuned rules** for the places where a generic mapping is not good enough (canvas backdrop, formula bar, elevated surfaces, scrollbars, focus rings).

Everything is wrapped in a CSS `@scope (:root) to (#publishedCanvas, .app-canvas)` donut, which is how the designer canvas stays untouched. A cached per-origin state applies a dark baseline at `document_start`, so there is no white flash.

## Development

```bash
npm test            # unit tests + WCAG contrast gate (node:test, no dependencies)
npm run build       # bundles theme/*.css into src/content/generated/theme-css.js and validates the manifest
npm run tokens      # regenerates the Fluent dark token spec from tools/data/fluent-light-tokens.json
npm run icons       # renders icons/*.png from a tiny built-in rasteriser
npm run standalone  # builds dist/standalone/capd-standalone.js for browser-driven checks without installing
npm run package     # dist/canvas-studio-dark-mode-<version>.zip
```

Load the folder as an unpacked extension after `npm run build`; the generated files are committed so a fresh clone loads as-is.

Diagnostics: in any themed frame's console, `CAPD.stats()` reports the engine state and `CAPD.debug = true` enables verbose logging.

## Compatibility

- Chrome and Edge 120+ (uses CSS `@scope`, MV3 `world: "MAIN"` content scripts).
- make.powerapps.com, including preview/test, GCC (`make.gov.powerapps.us`), GCC High, DoD and 21Vianet hosts, and the regional Studio authoring frames.
- Published apps and the player are deliberately out of scope and never touched.

## Licence

MIT — see `LICENSE`. "Power Apps" and "Fluent UI" are trademarks of Microsoft Corporation; this is an independent project, not affiliated with or endorsed by Microsoft.
