# Automatic startup on this machine

These systemd user services run as `omid` from `/home/omid/projects/vinyl-store-management`. **Lingering is enabled**, so the user service manager starts at boot without login and continues after logout.

Install as `omid`, without sudo:

```sh
sh /home/omid/projects/vinyl-store-management/backend/deploy/install-systemd.sh
```

First run `npm run db:setup` after installing MariaDB. The installer installs MySQL/API/web units, validates them, enables `vinyl-store.target`, and enables lingering. If the host denies lingering, an administrator must run `sudo loginctl enable-linger omid` once. The installer does not start/stop processes. For migration, stop the API/web, export/import with `npm run db:migrate`, stop and disable `vinyl-mongodb.service`, then install these units and start the target. Keep `.data/mongo` and migration backups for recovery.

```sh
systemctl --user start vinyl-store.target
systemctl --user status vinyl-mysql vinyl-api vinyl-web
loginctl show-user omid -p Linger
```

- MySQL-compatible MariaDB: `127.0.0.1:3306`, `.data/mysql`, Unix socket `.data/mysql/mysql.sock`. The database runs as omid; no system-wide database service is required.
- API: reads `backend/.env` (currently `127.0.0.1:5001`, existing public `CLIENT_URL`).
- Network frontend: `10.30.5.10:5173`, available at `http://10.30.5.10:5173` on the current LAN. It proxies API and sockets to the loopback API on port 5001. The LAN origin is explicitly allowlisted; private filesystem paths remain blocked. Netlify publishing is paused by user instruction; local and GitHub updates are the current workflow.
- The frontend now accepts routed traffic, including any enabled MikroTik forwards to port 5173. The API remains loopback-only. Existing public deployment notes and optional NAT rule removal are documented in [NETLIFY.md](NETLIFY.md).
- Each service restarts automatically after an unexpected exit. A normal database stop has up to 120 seconds to flush. Existing data is retained; no seed/reset runs.

```sh
systemctl --user restart vinyl-store.target # restart everything
systemctl --user restart vinyl-api         # load backend code updates
systemctl --user stop vinyl-store.target   # intentionally stop all three
systemctl --user disable vinyl-store.target # disable boot startup
journalctl --user -u vinyl-api -u vinyl-web -u vinyl-mysql -n 100 --no-pager
```

Do not run `npm run dev` alongside these services: they use the same ports. The frontend uses the existing Vite server so this changes supervision without changing the current HTTP login/proxy setup. Keep the repository, dependencies, `.env`, `.data`, and uploads in place; moving paths requires updating the units. Router forwarding and power/network availability remain external to systemd.

See the [2026-10-31 security review](../../docs/security-review-2026-10-31.md) for private-file protection, credential-rotation follow-up and remaining dependency findings.
