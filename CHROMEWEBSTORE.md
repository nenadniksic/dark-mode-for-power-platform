# Chrome Web Store Listing — Dark Mode for Power Platform

> Last Updated: 2026-11-04

## Store Listing

**Extension Name**
Dark Mode for Power Platform

**Short Description** (118 / 132 characters, same as manifest.json)
A carefully crafted dark theme for Power Apps Studio, the maker portal, Power Automate and, if you choose, SharePoint.

**Detailed Description** (plain text: the store strips Markdown)

```
Dark Mode for Power Platform makes Power Apps Studio, the Power Apps maker portal and Power Automate dark. The app you are building keeps its own colours, and colour pickers show true colours.

Choose a Classic or Neon style and a Dim, Dark or Black surface. Text is checked for readable contrast. Toggle it with Alt+Shift+D.

It runs only on Power Platform sites, and on SharePoint if you turn that on. It collects no data.

Power Apps and Power Automate are trademarks of Microsoft. This extension is independent and not affiliated with Microsoft.
```

**Category**
Developer Tools

**Single Purpose** (dashboard, Privacy tab)
Applies a readable dark theme to Microsoft Power Apps canvas Studio, the Power Apps maker portal and Power Automate, and optionally to SharePoint, where Power Platform solutions are often built and used.

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
| `scripting` | permissions | Starts the dark theme on SharePoint pages, only after the user has turned SharePoint on and granted access to it. The theme's own packaged scripts are registered for SharePoint while the option is on and removed when it is off. When the option is turned on, they are also applied once to SharePoint tabs that are already open, so those tabs change without a reload. No code is fetched or generated. |
| `https://*.sharepoint.com/*`, `https://*.sharepoint.us/*`, `https://*.sharepoint-mil.us/*`, `https://*.sharepoint.cn/*` | optional_host_permissions | Requested only when the user turns on the SharePoint option, and removed when they turn it off. Used to apply the same dark theme to SharePoint Online sites (worldwide and GCC, GCC High, DoD, and 21Vianet). Not requested at install. |

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
https://github.com/nenadniksic/dark-mode-for-power-platform/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public (or Unlisted to share a link with colleagues first)
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**: Nenad Niksic
**Contact Email**: (to fill in: a monitored address; Google sends policy and takedown notices here)
**Support URL**: https://github.com/nenadniksic/dark-mode-for-power-platform/issues
**Homepage URL**: https://github.com/nenadniksic/dark-mode-for-power-platform

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| Unreleased | 2026-11-04 | Opt-in SharePoint support (optional host permissions, `scripting`); border and row-divider fixes. Screenshots: consider one of a SharePoint list. | Not submitted |
| 1.2.1 | 2026-11-03 | Renamed from Canvas Studio Dark Mode, now that it covers Power Automate and the whole maker portal. | Draft |
| 1.2.0 | 2026-11-03 | Neon style with glowing controls; property label and command-bar fixes; light insert button over the canvas. | Not submitted |
| 1.1.0 | 2026-11-03 | Power Automate support; brand-aware accents; Studio sprite icon and colour picker fixes; contrast audit. | Not submitted |
| 1.0.0 | 2026-11-03 | Initial release. | Not submitted |

## Review Notes

### Known Issues / Limitations
- The extension depends on Studio's page structure. A Studio update can leave a pane or icon uncoloured until the extension is updated.
- "Developer diagnostics" (options page, off by default) lets a Power Apps or Power Automate maker page's console inspect the pages it embeds and try CSS in them. It exists for debugging this extension, accepts requests only from those maker sites, and does nothing while off. If a reviewer asks: it never runs scripts, only reads styles and applies CSS.
- A small script runs in the page's own context to notice style changes made by Studio's styling libraries. It only observes them and calls the original functions unchanged.
- SharePoint is opt-in and uses optional host permissions, so installing or updating the extension asks for no SharePoint access. Power Apps forms embedded in SharePoint lists stay light: they are published apps, which the extension never themes.

### Rejection History
None yet.
