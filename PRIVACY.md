# Privacy

Canvas Studio Dark Mode runs entirely inside your browser.

- It stores only its own settings (theme preferences) in `chrome.storage.sync`.
- It does not collect, transmit or sell any data. There is no telemetry, no analytics and no remote configuration.
- The only network requests it makes are fetches of Power Apps' and Power Automate's own stylesheet files when the browser does not expose their rules to the page (same resources the page already loads), restricted to Microsoft Power Platform hosts.
- It never reads the content of your apps, formulas or data; it only reads and rewrites CSS colours.
- Permissions: `storage` (settings) and host access to Power Apps and Power Automate domains (to run on Studio, the maker portal and Power Automate). No other permission is requested.
