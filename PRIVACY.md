# Privacy

Dark Mode for Power Platform runs entirely inside your browser.

- It stores only its own settings (theme preferences). They are kept with your Chrome profile and, if Chrome Sync is on, Chrome carries them to your other devices.
- It does not collect, transmit or sell any data. There is no telemetry, no analytics and no remote configuration.
- The only network requests it makes are fetches of Power Apps', Power Automate's and (when you turn SharePoint on) SharePoint's own stylesheet files when the browser does not expose their rules to the page (same resources the page already loads), restricted to Microsoft hosts.
- It changes only how pages look: it reads and rewrites their colours and styles. It never collects or sends the content of your apps, flows, formulas or data.
- Its diagnostic contrast check, which runs only when you start it from the browser's developer console, reads the page's visible text locally to report hard-to-read colours. The result stays on the page; nothing is transmitted.
- Permissions: `storage` (settings), `scripting` (to start the theme on SharePoint pages while you have it on), and host access to Power Apps and Power Automate domains (to run on Studio, the maker portal and Power Automate). Access to SharePoint sites is optional: Chrome asks for it only when you turn SharePoint on, and the extension gives it back when you turn it off. No other permission is requested.
