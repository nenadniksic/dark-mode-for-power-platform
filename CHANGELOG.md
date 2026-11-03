# Changelog

## 1.2.1 — 2026-11-03

- Renamed from Canvas Studio Dark Mode to Dark Mode for Power Platform, now that it covers Power Automate and the whole maker portal as well as canvas Studio. Settings carry over unchanged.
- The GitHub repository moved to [nenadniksic/dark-mode-for-power-platform](https://github.com/nenadniksic/dark-mode-for-power-platform). The old address redirects there.

## 1.2.0 — 2026-11-03

### Added
- Neon style (Style: Classic / Neon in the popup and options): a cyberpunk take with violet-black surfaces, faint pink-lavender text, a hot-pink accent everywhere (Power Automate included) and cyan focus rings, plus a pink glow on the Office header, primary buttons and selected tabs, and a neon edge on every bordered control (inputs, dropdowns, switches, checkboxes, option buttons) that brightens on hover, turns cyan on focus and lights up the chosen option. It combines with the Dim / Dark / Black surface and high-contrast settings, and passes the same WCAG gate.
- Developer diagnostics can preview settings in a page until it reloads (`capd:override`), so styles can be compared without changing the saved settings.

### Fixed
- Property labels in Studio's properties pane sat on grey chips. Studio cancels a Fluent button's white background with its own `!important`; the theme's dark copy of the white outranked it. Declarations a page marks `!important` now keep beating its normal ones under the theme.
- Studio's "+" insert button on an empty container was a dark disc with a dark purple plus over the light app. Studio's overlays on the canvas now keep their light look, like the canvas itself.
- Studio's command-bar buttons were a shade darker than the bar: Studio paints them with a Fluent text token (`colorNeutralForegroundInverted`), whose dark value is a text colour. A text token used as a background is now mapped like a surface, so the buttons match the bar.

## 1.1.0 — 2026-11-03

Power Automate support, and fixes found by a new rendered-page contrast audit.

### Added
- Power Automate: make.powerautomate.com (home, My flows, flow details, the new and the classic flow designer, templates, approvals, monitoring, process mining, AI hub, connections) and the Flows pages the Power Apps portal embeds from it.
- Each product keeps its own accent colour. The brand ramp is seeded from the root FluentProvider's light brand colour, so Studio keeps Power Apps' exact purple ramp and Power Automate gets a blue one. The last brand seen is cached per site for a flash-free start.
- `CAPD.audit()`: checks the rendered page for text below WCAG AA and for SVG icons and icon-font glyphs below 3:1, against the real surface behind them, and lists text drawn over background images. Framed pages (Studio, the Flows pages) answer audit requests from their maker-site parent by `postMessage`.
- The WCAG contrast gate now covers four brand ramps and raised surfaces.
- Developer diagnostics (options page, off by default): lets a maker page's console inspect the pages it embeds, such as Studio, and try CSS in them.

### Fixed
- Studio's sprite icons stayed black on dark buttons (the Justify / Align buttons in the properties pane). They are drawn with `<use>`, which renders a copy of the symbol in a shadow tree outside the theme's canvas scope, so the adapted colours never reached the copies. The inline-colour rules are now unscoped; they only act on elements the theme marks, and it never marks anything inside the canvas.
- SVG icons that carry no fill anywhere painted in SVG's default black on dark surfaces (the "+" of Upload in image pickers, the Power Platform icon in the portal navigation). They now take the surrounding text colour; icons with fills of their own keep them.
- The colour picker showed the wrong colours: palette swatches were lightened like text, the white-to-hue gradient of the custom colour area was darkened, and the hue slider dimmed. Colour previews (Studio's swatches and property swatches, Fluent's ColorPicker area and sliders, Fluent v9 colour components) are now excluded from the theme like the app canvas.
- Colour shorthands declared with `var()` (`background: var(--x)`, `border: 1px solid var(--y)`) were never rewritten, because the browser reports their longhands as empty. The Power Automate designer's zoom toolbar was white on white.
- Mapped text colours met AA on the base surface only; they now meet it on the raised surfaces of menus, callouts and dialogs too. Accent and Fluent text tokens follow the same rule.
- Dim surface with high-contrast text lightened card and hover surfaces as if they were strokes. Neutral text tokens now reach AAA in high-contrast mode, as the setting promises.
- Power Automate's filter pills (the selected "My flows" pill) were white text on light pink.
- Two copies of the engine on one page (the extension installed twice, or the test bundle beside it) re-appended their styles forever.
- A Monaco rule that never matched because of a typo in its attribute selector.

### Permissions
- Host access to make.powerautomate.com and its government and China equivalents. Chrome asks to approve this when the update installs.

## 1.0.0 — 2026-11-03

Initial release.

- Dark theme for Power Apps canvas Studio (authoring frame and host page) and the maker portal.
- Fluent UI v9 dark tokens for the Power Apps brand ramp, generated from Studio's light tokens.
- CSSOM rewriting engine with role-typed custom-property variants, cross-origin stylesheet support and MAIN-world CSSOM change tracking.
- Inline colour and SVG icon adaptation.
- The designer canvas is excluded via CSS `@scope`; published apps are never touched.
- Popup and options page: surface (dim / dark / black), high-contrast text, canvas backdrop, icon adaptation, maker-portal pages, follow-system mode, keyboard shortcut.
- WCAG contrast gate in the test suite.
