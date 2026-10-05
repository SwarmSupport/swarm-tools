# Swarm Tools

Swarm Tools is a network access app backed by the local `st-core` engine. The desktop version offers site rules, DNS, routing, and speed settings. The core also exposes optional local HTTP and SOCKS5 listeners. It does not capture all desktop traffic automatically.

## Run

```sh
npm install
python3 -m pip install PyYAML
npm start
```

The app reads `/Users/xiaoyuan/Documents/st-core/config.yaml` on first launch. Set `ST_CORE_DIR` to another core directory if needed. `npm start` builds the current Go source into `bin/st-core` before launching Electron. Saving writes a separate config to Electron's user data directory and validates it with `st-core check`; the source config is never overwritten. The core runs with its working directory set to `ST_CORE_DIR` so relative certificate, IP list, and GFW List cache paths continue to work. Changes take effect after restarting the core.

The default HTTPS, HTTP, and DNS listeners use `127.0.0.1:443`, `127.0.0.1:80`, and `127.0.0.1:53`. On macOS, previously saved legacy defaults on ports 8443, 8081, and 8053 are restored to these standard ports when loaded. The app backs up an affected saved config as `config.yaml.before-standard-port-migration` and logs each change.

On macOS, Home has a Routing switch and a Connection methods list for choosing exactly one of hosts updates, the system proxy, or system DNS. The current choice appears in the Connection methods row. System DNS is the default, and older saved selections with multiple methods are reduced to one choice. Rule and Global modes show the switch on; Bypass shows it off. Turning the switch off saves Bypass and stops the service. Turning it on restores the last Rule or Global mode and starts the service. Changing a connection method restarts a running service; selections made in Bypass are saved until routing is enabled. macOS asks for administrator approval; the privileged core uses ports 80 and 443 for hosts or system DNS routing, and port 53 for system DNS. Hosts entries cover the app's listed sites and exact configured origin domains; wildcard domains cannot be represented in `/etc/hosts`. The gateway CA must exist and be trusted for HTTPS sites. The system helper removes its hosts block and restores the previous DNS and HTTP/HTTPS proxy settings when the service stops or the app exits. Other operating systems do not yet support these switches.

The GUI maps to features currently exposed by `st-core`: primary and direct DoH, GFW List rules, wildcard origin domains, named CDN IP lists, explicit origin IPs, proxy listeners, startup IP selection, and on-demand speed tests. At startup the Core checks current DoH addresses for predefined websites against bundled provider ranges, verifies HTTPS certificates, and logs the fastest candidates above the configured minimum speed. Selected IPs appear in Settings. On-demand speed tests remain separate from routing. Diagnostics includes Reset config, which restores values from the core's source `config.yaml`, backs up the current saved config, and applies the restored routing mode. Platform data and CA files are kept. The Settings page can generate or regenerate the gateway CA while the service is stopped. Regeneration backs up the previous certificate and key beside their original paths, restores them if generation fails, and requires trusting the new CA. An older trusted CA remains trusted until removed separately; `st-core ca remove` can remove the current CA trust. DoT and community IP exchange remain unavailable.

The UI bundles Font Awesome locally for offline icons. Appearance follows the OS by default and can be set to Light or Dark from the top bar; the selection is stored locally.

The **+** beside Sites creates a custom site page, and **New** on a site page adds a domain. These entries are saved immediately in `platforms.sqlite3` under Electron's user data directory. New domains also add `||domain` routing rules. Configuration edits, added or removed domains, and origin IP assignments save and apply automatically after a short pause; the top bar shows the save status. Origin IP assignments live in `config.yaml`.

The Community section shows the IPs selected on this Core start in the local activity log. Its upload consent toggle is off by default and stored locally. Uploads remain a placeholder until a community API is provided; this app does not upload entries yet.

The desktop core starts with `st-core -config <file> start all`. The `mobile/` directory contains initial Android and iOS VPN entry points. The new `st-core/mobilecore` binding supplies loopback proxies, but mobile packet forwarding is not yet implemented. See [mobile/README.md](mobile/README.md) before attempting a mobile build.
