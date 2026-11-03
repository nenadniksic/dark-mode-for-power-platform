# Chrome Web Store Listing — Canvas Studio Dark Mode

> Last Updated: 2026-11-03

## Store Listing

**Extension Name**
Canvas Studio Dark Mode

**Short Description** (127 / 132 characters, same as manifest.json)
A carefully crafted dark theme for Power Apps Studio, the maker portal and Power Automate. Your app's canvas stays as designed.

**Detailed Description** (plain text: the store strips Markdown)

```
Canvas Studio Dark Mode turns Power Apps canvas Studio, the Power Apps maker portal and Power Automate dark, while the app you are building keeps its own colours.

FEATURES
• Dark Studio: command bar, formula bar, tree view, Insert, Data and Media panes, properties, dialogs, menus and tooltips.
• Your app stays as designed: the canvas you are editing, the colour swatches and the colour picker always show true colours.
• Power Automate too: home, My flows, flow details, the new and the classic flow designer, templates, approvals and monitoring, and the Flows pages inside the Power Apps portal.
• Two styles: Classic keeps each product's own accent colours. Neon is a cyberpunk look with violet-black surfaces, hot-pink accents and glowing controls.
• Dim, Dark or Black surfaces, a high-contrast text option, and a dark or light canvas backdrop.
• Readable by design: text and controls meet WCAG AA contrast, and AAA with high-contrast text.
• Follow your system's light or dark setting, or stay dark. Toggle any time with Alt+Shift+D.

WHY A DEDICATED DARK MODE
• Your app stays true: general dark modes recolour everything, including the app you are designing, so a white app looks dark. This one never touches your app.
• Colour pickers show real colours: the colour you pick is the colour you see.
• Made for Studio: icons, property labels, toolbars and panes are tuned one by one, not left to generic rules.
• Tested readability: every colour pairing is checked for WCAG contrast.
• Narrow access: it runs only on Power Platform sites, not on every site you visit.

HOW TO USE
1. Install the extension and open make.powerapps.com or make.powerautomate.com.
2. Edit a canvas app: Studio turns dark straight away.
3. Click the toolbar icon to change the style, surface and other options, or open All settings.

PRIVACY
The extension collects no data: no analytics, no accounts, no remote configuration. Your preferences are kept in your browser and follow your Chrome profile through Chrome Sync. It only changes how the pages look; nothing about your apps, flows or data leaves your browser.

PERMISSIONS
• "Read and change your data on powerapps.com, powerautomate.com and related Microsoft sites": needed to recolour those pages. The extension runs nowhere else, and never on published apps.

SUPPORT
Report a problem or suggest an improvement: https://github.com/nenadniksic/canvas-apps-darkmode/issues

Power Apps and Power Automate are trademarks of Microsoft Corporation. This extension is independent and is not affiliated with or endorsed by Microsoft.

Version 1.2.0: Neon style, glowing controls in Neon, and fixes for property labels and command-bar buttons in Studio.
```

**Category**
Developer Tools

**Single Purpose** (dashboard, Privacy tab)
Applies a readable dark theme to Microsoft Power Apps canvas Studio, the Power Apps maker portal and Power Automate.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Screenshot 1: Studio, Classic | 1280×800 | ⬜ Not created | |
| Screenshot 2: Studio, Neon | 1280×800 | ⬜ Not created | |
| Screenshot 3: Power Automate flow designer | 1280×800 | ⬜ Not created | |
| Screenshot 4: Settings popup | 1280×800 | ⬜ Not created | |
| Small Promo Tile (recommended) | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. Studio with an app open in Classic: dark chrome around a light app canvas, so the "your app keeps its colours" point is visible.
2. The same screen in Neon, with a container selected so the glowing property controls show.
3. The Power Automate designer with an action's panel open.
4. The toolbar popup with its options.
Use a demo app and demo flows with no customer or employee names in them.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves the user's theme preferences (on or off, style, surface, contrast, canvas backdrop, icon and portal options) and keeps them in step across the user's Chrome profile. |
| `https://*.powerapps.com/*` | host_permissions | Applies the dark theme to Power Apps canvas Studio and the Power Apps maker portal (make.powerapps.com, its preview and test hosts, and the regional Studio editing frames). The background script also downloads these pages' own stylesheet files from content.powerapps.com when the browser does not let the page script read them, so they can be recoloured. |
| `https://*.powerapps.us/*`, `https://*.appsplatform.us/*` | host_permissions | The same theme for the US Government clouds (GCC, GCC High and DoD), which serve Power Apps from these domains. |
| `https://*.powerapps.cn/*` | host_permissions | The same theme for Power Apps operated by 21Vianet in China. |
| `https://*.powerautomate.com/*`, `https://*.powerautomate.us/*`, `https://*.powerautomate.cn/*` | host_permissions | Applies the theme to Power Automate (make.powerautomate.com and its government and China equivalents), including the Flows pages the Power Apps portal embeds from it. |
| `https://*.flow.microsoft.com/*` | host_permissions | Power Automate's earlier domain, which still serves regional and embedded flow pages. |

**Are you using remote code?** No. All JavaScript ships in the package; the extension only downloads stylesheet text, which it reads, never executes.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | | No |
| Health info | No | No | | No |
| Financial info | No | No | | No |
| Authentication info | No | No | | No |
| Personal communications | No | No | | No |
| Location | No | No | | No |
| Web history | No | No | | No |
| User activity | No | No | | No |
| Website content | No | No | | No |

Notes for the form: the only stored data is the user's own theme preferences, which Chrome Sync carries between the user's devices. That is disclosed in the privacy policy. The diagnostic contrast check reads page text locally only when the user runs it, and returns the result to the same page; nothing is transmitted.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/nenadniksic/canvas-apps-darkmode/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public (or Unlisted to share a link with colleagues first)
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**: Nenad Niksic
**Contact Email**: (to fill in: a monitored address; Google sends policy and takedown notices here)
**Support URL**: https://github.com/nenadniksic/canvas-apps-darkmode/issues
**Homepage URL**: https://github.com/nenadniksic/canvas-apps-darkmode

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.2.0 | 2026-11-03 | Neon style with glowing controls; property label and command-bar fixes; light insert button over the canvas. | Draft |
| 1.1.0 | 2026-11-03 | Power Automate support; brand-aware accents; Studio sprite icon and colour picker fixes; contrast audit. | Not submitted |
| 1.0.0 | 2026-11-03 | Initial release. | Not submitted |

## Review Notes

### Known Issues / Limitations
- The extension depends on Studio's page structure. A Studio update can leave a pane or icon uncoloured until the extension is updated.
- "Developer diagnostics" (options page, off by default) lets a Power Apps or Power Automate maker page's console inspect the pages it embeds and try CSS in them. It exists for debugging this extension, accepts requests only from those maker sites, and does nothing while off. If a reviewer asks: it never runs scripts, only reads styles and applies CSS.
- A small script runs in the page's own context to notice style changes made by Studio's styling libraries. It only observes them and calls the original functions unchanged.

### Rejection History
None yet.
