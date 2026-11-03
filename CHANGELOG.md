# Changelog

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
