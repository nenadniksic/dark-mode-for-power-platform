# Chrome Web Store Listing — Dark Mode for Power Platform

> Last Updated: 2026-11-09

## Store Listing

**Extension Name**
Dark Mode for Power Platform

**Short Description** (118 / 132 characters, same as manifest.json)
A carefully crafted dark theme for Power Apps Studio, the maker portal, Power Automate and, if you choose, SharePoint.

**Detailed Description** (plain text: the store strips Markdown)

```
Dark Mode for Power Platform makes Power Apps Studio, the Power Apps maker portal and Power Automate dark. The app you are building keeps its own colours, and colour pickers show true colours.

Choose a Classic or Neon style and a Dim, Dark or Black surface. Text is checked for readable contrast.

Keep it dark all the time, follow your system, or go dark from sunset to sunrise or between hours you choose. Sunset is worked out on your computer from your time zone or coordinates you enter, with no location access. Alt+Shift+D switches it by hand.

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
| `storage` | permissions | Saves the user's theme preferences so they persist and follow the user's Chrome profile: on or off, style, surface, contrast, canvas backdrop, icon and portal options, whether SharePoint is themed, and when to go dark (always, following the system, sunset to sunrise, or set hours). For sunset to sunrise the user may type in a location; it is stored rounded to about 1 km with the other preferences, which Chrome Sync carries between the user's own devices. A temporary switch made by hand is kept on this computer only. Nothing else is stored, and the extension sends none of it anywhere. |
| `https://*.powerapps.com/*` | host_permissions | Applies the dark theme to Power Apps canvas Studio and the Power Apps maker portal (make.powerapps.com, its preview and test hosts, and the regional Studio editing frames). The background script also downloads these pages' own stylesheet files from content.powerapps.com when the browser does not let the page script read them, so they can be recoloured. |
| `https://*.powerapps.us/*`, `https://*.appsplatform.us/*` | host_permissions | The same theme for the US Government clouds (GCC, GCC High and DoD), which serve Power Apps from these domains. |
| `https://*.powerapps.cn/*` | host_permissions | The same theme for Power Apps operated by 21Vianet in China. |
| `https://*.powerautomate.com/*`, `https://*.powerautomate.us/*`, `https://*.powerautomate.cn/*` | host_permissions | Applies the theme to Power Automate (make.powerautomate.com and its government and China equivalents), including the Flows pages the Power Apps portal embeds from it. |
| `https://*.flow.microsoft.com/*` | host_permissions | Power Automate's earlier domain, which still serves regional and embedded flow pages. |
| `scripting` | permissions | Starts the dark theme on SharePoint pages, only after the user has turned SharePoint on and granted access to it. The theme's own packaged scripts are registered for SharePoint while the option is on and removed when it is off. When the option is turned on, they are also applied once to SharePoint tabs that are already open, so those tabs change without a reload. No code is fetched or generated. |
| `https://*.sharepoint.com/*`, `https://*.sharepoint.us/*`, `https://*.sharepoint-mil.us/*`, `https://*.sharepoint.cn/*` | optional_host_permissions | Requested only when the user turns on the SharePoint option, and removed when they turn it off. Used to apply the same dark theme to SharePoint Online sites (worldwide and GCC, GCC High, DoD, and 21Vianet). Not requested at install. |

**Host permission justification** (the dashboard has one field for all host permissions; 974 / 1,000 characters):

```
The extension recolours only Microsoft Power Platform maker sites: powerapps.com (Power Apps Studio and the maker portal), powerautomate.com and flow.microsoft.com (Power Automate, including the Flows pages embedded in the Power Apps portal), and the matching US Government (powerapps.us, appsplatform.us, powerautomate.us) and China (powerapps.cn, powerautomate.cn) domains. Studio runs in a frame on these hosts, so the theme must run in those frames too. The background script downloads these pages' own stylesheets when the page cannot read them, so they can be recoloured. It runs on no other site and does nothing on published apps.

SharePoint (sharepoint.com, sharepoint.us, sharepoint-mil.us, sharepoint.cn) is an optional host permission. It is requested only when the user turns on the SharePoint option, used only to apply the same dark theme to SharePoint pages, and given back when the user turns the option off. Nothing is requested for SharePoint at install.
```

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

Location stays "No": the sunset-to-sunrise schedule never reads the device location (there is no geolocation permission). It uses the time zone's city, or coordinates the user types in, stored with the other settings and never transmitted by the extension.

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
**Item ID**: `hgnopejckjkdddefjdcpdagjilhbjmom` (public: it is in the store address; this is the `CWS_ITEM_ID` secret)
**Contact Email**: (to fill in: a monitored address; Google sends policy and takedown notices here)
**Support URL**: https://github.com/nenadniksic/dark-mode-for-power-platform/issues
**Homepage URL**: https://github.com/nenadniksic/dark-mode-for-power-platform

## Automated publishing

Pushing a tag such as `v1.3.0` runs [`.github/workflows/publish.yml`](.github/workflows/publish.yml). It runs the tests, packages the zip, uploads it to this item with [`tools/publish-cws.mjs`](tools/publish-cws.mjs) and submits it for review. Once Google approves it, the update goes live and reaches users on its own. The tag must match the version in `manifest.json` and `package.json`, and that version must be higher than the one in the store.

The API cannot edit this listing. The first publish, and any release that adds a permission or changes the listing text, still needs the dashboard: update the Store listing and Privacy practices tabs there first, then tag.

### One-time setup
1. **Google Cloud:** create a project (or use an existing one), search for **Chrome Web Store API** and enable it, then create a **service account** in that project. It needs no roles.
2. **Key:** on the service account, open Keys > Add key > Create new key > JSON, which downloads the file. It is a password: store it only as the GitHub secret below, then delete the download. (If an organisation policy blocks key creation, the project has to belong to an account without that policy.)
3. **Developer Dashboard:** open **Publisher > Settings** (not Account > Profile). In the **Service account** section, enter the service account's email address and click **Add a service account**. A publisher can have only one service account.
4. **IDs:** note the **Publisher ID** (Publisher > Settings) and the **item ID** (the 32-letter ID in the store URL).
5. **GitHub:** in the repository, go to Settings > Environments, create **chrome-web-store** and add three secrets: `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`, and `CWS_SERVICE_ACCOUNT_KEY` (the whole JSON file as text). To require a manual approval before each upload, add yourself as a required reviewer on that environment.
6. **Check:** under Actions, open **Publish to Chrome Web Store**, choose **Run workflow** and pick mode **status**. It prints what is published and submitted, and changes nothing in the store.

### Each release
1. Bump `version` in `manifest.json` and `package.json`, add the CHANGELOG entry and a Version History row below, then merge to main.
2. Run `git tag v1.3.0` and then `git push origin v1.3.0`.
3. Watch the run under Actions. It stops before uploading if a submission is already in review or that version is already live.

To hold an approved update for a manual Publish, run the workflow by hand in **staged** mode instead of tagging. You then have 30 days after approval to publish it. To run it from this computer, use `npm run package` and then `CWS_PUBLISHER_ID=… CWS_ITEM_ID=… CWS_ACCESS_TOKEN=$(gcloud auth print-access-token --impersonate-service-account=<email> --scopes=https://www.googleapis.com/auth/chromewebstore) npm run cws:publish`.

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.3.1 | 2026-11-11 | Dark canvas backdrop switch works again (theme rules now carry the override layer's specificity boost); formula bar, message bar tints and Neon disabled edges restored; readable links on tinted message bars; theme scrollbars and selection colour reach inner panes. No permission or listing changes. | Tagged v1.3.1 2026-11-11 (submitted by GitHub Actions) |
| 1.3.0 | 2026-11-09 | Scheduled dark mode (sunset to sunrise, custom hours, switch by hand); opt-in SharePoint support (optional host permissions, `scripting`); new page styles are recoloured before the next paint; animated colours, Fluent v9 dialogs and switched-off borders handled; Neon disabled controls read as disabled. Screenshots: consider one of a SharePoint list. | Published (live in the store's update feed, checked 2026-11-11) |
| 1.2.1 | 2026-11-03 | Renamed from Canvas Studio Dark Mode, now that it covers Power Automate and the whole maker portal. | Published (100%, confirmed through the API 2026-11-09) |
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
