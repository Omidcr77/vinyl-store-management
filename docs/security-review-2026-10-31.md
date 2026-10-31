# Security review — 2026-10-31

## Assessment

This was a focused source, dependency and deployed-browser review of the flooring application, not a comprehensive penetration test or an assurance that no compromise occurred. The Netlify static frontend and the older Vite fallback are different attack surfaces. A confirmed private-file exposure in the fallback has been closed, frontend-tooling advisories have been patched, and security headers have been deployed. Credential rotation and the remaining moderate dependency findings still need attention before a commercial production sign-off.

## Confirmed private-file exposure — fixed, credential rotation required

The fallback Vite server ran as the same Unix user that owns `.data`. Before remediation, an unauthenticated filesystem URL on port 5173 returned a harmless, mode-0600 canary file from that private folder. No real secret or customer backup was fetched to demonstrate the issue. The supplied router export forwards external ports 7070/8900 to this listener, which was bound to all interfaces; whether those router rules remain active was not independently verified.

The private folder contains deployment credentials, session-state files and store backups. File permissions alone did not prevent the web server, running as their owner, from serving them. Previous third-party access cannot be ruled out by this review.

Remediation:

- The Vite fallback now binds to `127.0.0.1:5173`; the raw API binds to `127.0.0.1:5001`. Netlify continues using the authenticated HTTPS tunnel and the loopback API gateway. Optional direct HTTPS access on 9444 remains a separate, TLS-protected gateway.
- Vite now explicitly denies `.data`, `.netlify`, `.git`, backend files and standard environment/key files. The deny policy is shared with a harmless-file regression test. Direct and raw filesystem probes are refused; an import wrapper cannot disclose the file contents.
- Vite was patched from 7.3.6 to 7.3.7, which also addresses the published filesystem and editor-related advisories. Do not expose a Vite development server directly to the internet. The old HTTP port forwards can be disabled using the existing deployment instructions.

Required operator follow-up:

1. Create a replacement Netlify personal access token, save it privately as `.data/netlify-token` with mode 0600, and revoke the previous token. Restart `vinyl-netlify-tunnel.service` so the publisher reads the replacement.
2. Change the app administrator password or otherwise revoke existing app sessions. Password reset/change revokes the associated sessions. Review account/site activity in Netlify and the app audit log.
3. Rotate any other still-valid credentials retained in private configuration backups, particularly database credentials. Keep backups protected and do not publish them.

These steps are recommended because the folder was readable through the fallback, not because this review established that someone stole credentials. No credentials have been silently rotated by this change.

## Dependency findings

Before patching, the repository-wide audit reported 19 package findings: 2 critical, 7 high and 10 moderate. The frontend workspace reported 2 high findings in Vite and source-map-js; these are development/build tooling, not JavaScript modules necessarily shipped to the browser. The publicly reachable development server made its tooling exposure relevant nevertheless.

Compatible updates patched Vite, source-map-js, body-parser, multer, sharp, zod, qs, follow-redirects, concurrently and shell-quote, including their applicable native/transitive dependencies. After the updates:

- Frontend workspace: **0 npm audit findings**.
- Whole application repository: **0 high, 0 critical, 9 moderate findings**.

The remaining findings are in ExcelJS's dependency chain: archiver, archiver-utils, exceljs, glob, minimatch, readdir-glob, rimraf, uuid and zip-stream. They include the minimatch glob-amplification and UUID buffer advisories. npm proposes a breaking ExcelJS downgrade to resolve the chain automatically; this review did not force that change or claim the affected code is unreachable. Excel imports are limited to authenticated managers/admins and bounded files, which limits exposure but does not prove the dependencies safe. A supported replacement or carefully tested dependency migration is still needed.

The audit covers the repository's installed dependency tree, not every OS package, router component or separately installed publishing CLI. Audit results are time-specific and must be repeated as advisories change.

## Browser hardening — deployed

Netlify's static response headers now include a Content Security Policy, `X-Frame-Options: DENY`, a Permissions Policy disabling unused camera/microphone/geolocation APIs, and `Cross-Origin-Opener-Policy: same-origin`, alongside existing HSTS, MIME-sniffing prevention and referrer policy.

The CSP allows scripts and connections only from the site's own origin; it blocks plugins, child frames, framing by other sites, external form submission and base-URL replacement. Inline styles remain allowed because React styles and the printable document templates use them. HTTPS image URLs remain supported. This is defense in depth, not a substitute for output escaping or authorization.

Netlify custom headers do not automatically apply to proxied API responses. The backend independently supplies `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` for API responses.

## Controls reviewed and checked

- Public requests without a session were rejected for customers, users, settings, backups and private images. A foreign browser Origin was rejected.
- Browser session cookies use Secure, HttpOnly and SameSite=Strict through the HTTPS deployment. The frontend keeps CSRF state in memory and does not store passwords or authentication tokens in localStorage.
- Role checks and write-CSRF checks run on the server as well as in the interface. Automated integration tests cover staff/admin restrictions, account/session lifecycle and CSRF failures.
- React escapes normal displayed data. The two `dangerouslySetInnerHTML` document consumers use shared renderers that escape user-controlled text. Existing malicious-markup regression cases were checked. This review did not find an XSS path in those renderers; it does not prove the absence of every XSS issue.
- Live browser checks cover normal pages, authenticated polling, secure cookies, PDF downloads, absence of CSP violations during legitimate use, and refusal to display the application in a foreign iframe.
- Database contents were fingerprinted before and after the security restart; saved record contents were unchanged. No production records were created or deleted for this review.

## Limits and next steps

The existing login limiter is process-local and the reverse-proxy topology can cause clients to share an IP limit. A trusted, shared rate-limiting design remains a production hardening task. The supervised Quick Tunnel republishes changed backend URLs but is still a test transport without an uptime guarantee; use a permanent authenticated tunnel/domain for commercial hosting. This review did not audit the complete MikroTik export, unrelated CONNECT services, operating-system hardening or historical access logs.

References: [Vite filesystem controls](https://vite.dev/config/server-options.html#server-fs-deny), [Vite advisory](https://github.com/advisories/GHSA-rq7h-c2jc-7f22), [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), [Netlify custom-header limitations](https://docs.netlify.com/manage/routing/headers/), [OWASP CSP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html), [OWASP framing defenses](https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html).
