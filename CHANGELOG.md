# Changelog

## Unreleased

### Fixed
- The *Dark canvas backdrop* switch did nothing, and had not since 1.2.0: Studio's dotted work area kept a dark grey from Studio's own colours in both positions. Since 1.2.0 the theme repeats a page's `!important` declarations with a specificity boost, so that they keep beating the page's normal ones. Studio styles the backdrop with `!important`, and the boosted copy outranked the theme's own backdrop rule. The theme's hand-written `!important` rules now carry the same boost. The switch works again, and the backdrop and its dots are the theme's colours (Neon's pink dots included).
- Other hand-written rules the same boost had overruled now apply again: the formula bar matches the command bar, message bars keep their warning, error and success tint (Studio's read-only notice), and disabled property buttons in the Neon style get their plain edge.
- Links on those tinted message bars are lightened to read at 4.5:1 or more (Studio's "Learn more").

## 1.3.0 — 2026-11-09

### Added
- Scheduled dark mode. Appearance now offers *Sunset to sunrise* and *Custom hours* beside *Always dark* and *Follow system*, in the popup and the options page. Sunset and sunrise are worked out on your computer, for the city your time zone is named after or for coordinates you enter in the options; the extension asks for no location permission and goes online for nothing. Custom hours can run overnight (19:00 to 07:00) or within the day. Visible tabs switch at the scheduled minute; after sleep they catch up within a minute, and a hidden tab as soon as you return to it. The popup says what comes next ("Light until sunset at 16:24").
- Each appearance keeps its own hours and location while you try another, and turning dark mode off and on keeps the appearance you chose. The schedule only decides whether the theme is on right now; it never changes your settings.
- Under a schedule, Alt+Shift+D, or *Switch to light* / *Switch to dark* in the popup, gives you the other look until the schedule next changes; then the schedule carries on as usual. Pressing again goes back to the schedule at once. The switch is kept on this computer only, and choosing another appearance or using the master switch ends it. Under *Always dark* and *Follow system* the shortcut is still the master switch.
- SharePoint, as an opt-in (Where > SharePoint in the options page, or the SharePoint switch in the popup). Pages, lists, document libraries, menus, panels and the classic settings pages go dark in each site's own theme colour, in either style. Turning it on asks Chrome for access to SharePoint sites; turning it off gives that access back, so the extension holds none while SharePoint is off. Open SharePoint tabs change at once. OneDrive is left alone (it has a dark mode of its own), as are Power Apps forms and apps embedded in SharePoint, which are published apps.

### Fixed
- "Follow system" no longer says the theme is active in the popup while your system is light.
- A border a page had switched off through a variable could come back: SharePoint's document library drew a line under its command bar. The page sets `--sp-cmd-barWrapper-border-bottom: none`, and the theme fell straight through to the rule's default border instead of reading the page's own value first.
- SharePoint dialogs built with Fluent v9 (Create view, among others) showed a lighter box inside the dialog. SharePoint adds Fluent v8 class names to its v9 components, and the theme's v8 rules painted them a second time: the dialog body as a raised surface, the text field as a filled input. Those rules now apply to Fluent v8 components only.
- In the Neon style, disabled buttons looked as live as enabled ones (Studio's Save and its menu beside Publish). Neon tinted every grey pink, and the greys Fluent uses for disabled and placeholder text came out the same pink as the accent; the disabled colour itself was a magenta. Those greys now keep only a trace of violet, so disabled reads grey against coloured, as in Classic. Ordinary text keeps its tint.
- Pages that build their styles as they go (SharePoint above all) showed light, then went dark in stages. New page styles are now rewritten before the next paint, and a stylesheet that grows is rewritten only in its new part. On a SharePoint library opened from the site home, the delay from a new page style to its dark copy fell from about 120 ms to under one frame.
- The theme's own style elements were all moved to the end of the page whenever one of them was out of place, a few hundred at a time on SharePoint, each move a style recalculation. Only the ones out of place move now.
- Colours set by CSS animations stayed light. SharePoint's selected-items command bar fades in to a white surface and keeps it, so selecting a file turned the bar white. Animations that change a colour now run on a dark copy of their keyframes.
- SharePoint's document library command bar sat on a dark band behind its buttons. SharePoint gives the bar a grey fill in one rule and clears it in a later one; the theme carried the fill over but not the clearing.
- Buttons the page draws without a border could get a 1px box (SharePoint's command bars: New, Page details, Share, Edit). A Fluent reset style declares `border: var(--strokeWidthThin) solid <colour>` and atomic classes then set the widths to 0; the theme re-asserted the whole shorthand, width included. A border, outline or text-decoration shorthand is now recoloured through its colour alone.
- Row dividers drawn as a `border-image` gradient with `var()` colours kept their light colour (SharePoint's list and library rows showed bright white lines).
- When a page has several Fluent v9 theme providers, the accent now comes from the first one created, and a grey "brand" (SharePoint's de-themed panels) is never taken for the accent.
- Studio's Settings dialog in the Neon style: General / Display / Updates / Support each sat in a pink box. They are Fluent buttons acting as tabs, and the glow meant for bordered controls caught them. Tabs no longer glow; the selected page gets a pink edge instead.
- Disabled switches showed no state in either style (Settings > Updates when the app is read-only or shared): the thumb became as dark as the pill. A disabled switch is now an outline when off and filled when on.
- In the Neon style, buttons the page draws without a border got a pink box anyway: the solution explorer's sidebar (Overview / Objects / History / Pipelines / Source control) and its ≡ toggle, among others. They are Fluent default buttons with a transparent border, and the glow for bordered buttons forced an edge onto them. The theme now notices a transparent border and leaves those buttons alone; bordered ones still glow.
- In the Neon style, disabled controls glowed like enabled ones. They now keep a plain edge and no halo.
- Disabled text was close to unreadable (about 2.3:1 on a dialog, a murky purple in the Neon style), and Studio explains disabled settings in it. It now reads at 3:1, still clearly dimmer than enabled text.

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
