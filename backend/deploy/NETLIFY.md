# Netlify frontend and a local MySQL backend

The React build runs on Netlify. Browser requests remain same-origin (`/api` and `/socket.io`); Netlify proxies them to a public **HTTPS** backend. Database files, photos, `.env`, account tokens, and passwords stay on the store computer. Socket.IO uses HTTP polling in this build because Netlify does not proxy WebSocket upgrades. Normal local builds keep their existing transport behavior.

## Publish from your Netlify account

1. Sign into Netlify and authorize the CLI or set `NETLIFY_AUTH_TOKEN` privately. Gmail credentials are not Netlify API credentials. Never put either password or a token in source files, frontend build variables, or Git.
2. Set `PUBLIC_BACKEND_URL` to an HTTPS origin without a path, such as your stable Cloudflare Tunnel hostname. Use standard HTTPS port 443; the supplied dedicated port-9444 NAT example is for direct API access and diagnostics, not the Netlify proxy target.
3. From the repository root, run:

   ```sh
   npm run build:netlify
   npx netlify-cli deploy --filter vinyl-frontend --dir "$PWD/frontend/dist" --no-build --prod
   ```

   The build writes `_redirects` with the API and Socket.IO proxy rules **before** the SPA fallback. It refuses a missing, HTTP, or custom-port backend URL. For continuous deployment, import the GitHub repository in Netlify, keep the repository root as the build base, use the committed `netlify.toml`, and set `PUBLIC_BACKEND_URL` for Builds.

4. Add the exact deployed `https://YOUR-SITE.netlify.app` origin to `CLIENT_URLS` in private `backend/.env`, preserving `CLIENT_URL` for the local app, then run `systemctl --user restart vinyl-api`. Comma-separated additional origins are supported; wildcard origins are refused. Add a custom domain separately if you use one.
5. Verify the public `/api/health`, then sign into the app, reload, open customers/inventory/reports, test PDFs and downloads, check the browser's Network panel for successful polling, and log out. API responses use `Cache-Control: no-store`; HTTPS proxy responses issue Secure/HttpOnly/SameSite cookies. Do not cache authenticated API responses at the CDN.

A Netlify deployment without an account is a **temporary, unclaimed** site; claim it into your own account within Netlify's 60-minute window. The CLI's anonymous upload path may omit `_redirects`/`_headers` even though authenticated deployment processes them; verify actual API and deep-link responses rather than assuming a successful file upload means a working app. Private deployment/claim details for this test are under `.data/deployment-test`, outside Git. Account claiming and a stable backend hostname are required for a lasting deployment.

## HTTPS tunnel: no router changes

For a short test, `cloudflared tunnel --url http://127.0.0.1:5105 --protocol http2` creates a public HTTPS tunnel to the dedicated gateway. The gateway proxies only `/api` and `/socket.io` to the local API and never retries forwarded writes. It does not serve database files or the frontend source. The gateway is supervised by `vinyl-public-proxy.service`. The account-owned public test site is [vinyl-store-afg.netlify.app](https://vinyl-store-afg.netlify.app). Its connector/publisher is `vinyl-netlify-tunnel.service`, enabled at boot.

Quick Tunnels change hostname when restarted and have no uptime guarantee. The supplied supervisor detects the new hostname, waits for API health, rebuilds the frontend, updates the site's `PUBLIC_BACKEND_URL` setting, and publishes its proxy rules automatically. The Netlify frontend URL stays the same. A restart can briefly interrupt API access while it reconnects and republishes. For commercial production, use a named Cloudflare Tunnel with a stable hostname and disable this temporary publisher after deploying the permanent backend URL. Keep the computer and database running.

The supervisor reads `.data/netlify-token` (mode 0600) and `.data/netlify-site.json` (`id`, `url`); neither is published. `.data/netlify-tunnel.env` points to the local Cloudflare binary and the installed Netlify CLI script. This host uses Netlify CLI 27.16.1 under `~/.local/lib/vinyl-netlify-cli/node_modules/netlify-cli/bin/run.js`. To reproduce that installation, use `npm install --prefix ~/.local/lib/vinyl-netlify-cli netlify-cli@27.16.1`. The account token is passed only to the deployment CLI; it is excluded from the frontend build environment.

```sh
systemctl --user status vinyl-netlify-tunnel vinyl-public-proxy
journalctl --user -u vinyl-netlify-tunnel -n 30 --no-pager
systemctl --user restart vinyl-netlify-tunnel # reconnect, rebuild and republish
```

Publication status is saved in `.data/netlify-tunnel-state.json`. Detailed logs stay privately under `.data`. `systemctl --user disable --now vinyl-netlify-tunnel` stops the temporary publisher/connector; configure and test a replacement backend before doing that. No inbound NAT or hotspot-profile/DNS changes are needed for an outbound tunnel.

The private `.data/public-api.env` can configure `PUBLIC_API_HOST`, `PUBLIC_API_PORT`, and `PUBLIC_API_TARGET` (a fixed local HTTP origin). `PUBLIC_API_TARGET_FILE` is an optional private JSON file containing `{"target":"http://127.0.0.1:5001"}`; the public browser cannot choose the target. It is used during testing to switch between the isolated test API and the live API without replacing the HTTPS tunnel URL.

## Optional direct API access through MikroTik NAT

The supplied export already routes public TCP **80 → 8088** and **443 → 9443** to CONNECT. Keep those rules and services in place. The dedicated flooring API instead uses public TCP **9444 → 10.30.5.10:9444**. Its TLS certificate is already valid for public IP `149.54.58.86`; no invented DNS name or hotspot `dns-name` is needed.

This host's `.data/public-api-tls.env` configures:

```dotenv
PUBLIC_API_HOST=0.0.0.0
PUBLIC_API_PORT=9444
PUBLIC_API_TARGET=http://127.0.0.1:5001
PUBLIC_API_TLS_CERT=/home/omid/projects/connect/.data/acme/live/connect-public-ip/fullchain.pem
PUBLIC_API_TLS_KEY=/home/omid/projects/connect/.data/acme/live/connect-public-ip/privkey.pem
```

`vinyl-public-tls.service` runs the gateway. It reloads renewed certificate files without interrupting existing connections. It depends on CONNECT's existing ACME renewal and port-80 challenge routing; if that setup changes, provision a separate certificate/renewal before removing it. Certificate keys are not copied into Netlify or Git.

Verify the TLS listener locally, including certificate validation:

```sh
curl --noproxy '*' --resolve 149.54.58.86:9444:127.0.0.1 https://149.54.58.86:9444/api/health
```

Apply [mikrotik-vinyl-https.rsc](mikrotik-vinyl-https.rsc) in the MikroTik terminal. The script adds three dedicated, labeled rules: destination NAT for TCP 9444, a WAN forwarding allowance, and PC-subnet hairpin source NAT. It leaves all hotspot profiles, RADIUS, DHCP, VPN, DNS and CONNECT rules unchanged. Rollback commands for only those three new rules are in the same file.

From **another internet connection** (for example mobile data), open `https://149.54.58.86:9444/api/health`. Expect `{"success":true,"data":{"status":"ok"}}`. This validates direct API access. **Do not use the custom port 9444 as a Netlify proxy target**: Netlify's [published support guidance](https://answers.netlify.com/t/forwarding-ports-from-dns/55769/9) limits upstream proxy ports to HTTP 80 / HTTPS 443. The tested Netlify deployment uses the HTTPS tunnel on standard port 443. To use the router public IP with Netlify instead, the existing TLS server on public 443 would need an explicitly configured separate hostname or path routing to the flooring API. That shared-service change has not been applied; do not redirect all port-443 traffic away from CONNECT. Testing the TLS service through a local `--resolve` does not prove WAN forwarding; a request from this PC may also require the supplied hairpin rule.

Once the HTTPS Netlify route works, you can optionally disable only the older raw-HTTP flooring forwards from the export:

```routeros
/ip firewall nat disable [find where chain=dstnat dst-address=149.54.58.86 dst-port=8901 to-addresses=10.30.5.10 to-ports=5001]
/ip firewall nat disable [find where chain=dstnat dst-address=149.54.58.86 dst-port=8900 to-addresses=10.30.5.10 to-ports=5173]
/ip firewall nat disable [find where chain=dstnat dst-address=149.54.58.86 dst-port=7070 to-addresses=10.30.5.10 to-ports=5173]
```

Never forward MySQL TCP 3306. The database remains bound to localhost.

## Repeat the tests safely

`npm test` includes secure-cookie/origin/CSRF checks and gateway tests for streamed bodies/cookies, path restrictions and failure without write replay. The full browser suite can exercise an actual Netlify deployment using an isolated database:

```sh
UI_TEST_FRONTEND_URL=https://YOUR-SITE.netlify.app npm run test:ui
```

During that run, route the public test gateway to the suite's local API on port 5002. The suite creates/drops its own `vinyl_test_*` database, uses separate upload/backup directories, and tests UI roles, stock, suppliers, sales, payments, PDFs, exports, mobile layouts and restores. It never seeds or resets the live store. If the unclaimed Netlify deployment has its temporary platform password, pass it privately as `UI_TEST_SITE_PASSWORD` for the test only. Restore the gateway upstream to port 5001 after the test. Run remote testing on an unshared deployment because its visitors see the test API while the suite runs.

References: [Netlify proxy rules and timeout](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/), [Netlify CLI deployment](https://cli.netlify.com/commands/deploy/), [Cloudflare Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [MikroTik NAT](https://help.mikrotik.com/docs/spaces/ROS/pages/3211299/NAT).
