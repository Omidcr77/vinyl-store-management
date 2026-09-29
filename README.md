# فرش و قالین فروشی — Flooring Store Management

A local, full-stack point-of-sale and inventory application built with React, Vite, Tailwind CSS, Lucide, Express, MongoDB/Mongoose and Socket.io.

Manage partial rolls, sales, customers, outstanding balances, receipts, reports, CSV/Excel exports and printable invoices/statements. All screens use the real API. No browser-only sample records are used.

The interface is in **Dari (`fa-AF`) with right-to-left layout**, including mobile navigation, print views, validation messages and exported column headings. Numbers use English digits (`1234567890`), including prices, quantities, dates and PDFs. In **تنظیمات → تقویم**, choose **هجری شمسی (فارسی)** or **میلادی** and save. Existing installations default to Gregorian. Persian mode includes a date picker and `YYYY/MM/DD` entry with leap-day validation; month names follow Dari. The preference applies to screens, forms, date filters, the current-month reporting period, printed documents, and CSV/Excel dates. API/database dates stay Gregorian ISO dates, so switching calendars never rewrites records or invoice numbers. Product names and customer details remain as entered. Add inventory through the popup form opened by the add-record button on the inventory page.

The default store name is **فرش و قالین فروشی** and the default currency is **USD**. Each invoice and new payment receipt stores its currency. Currency changes remain blocked after the first sale or receipt to protect financial history.

## Photos, printing and PDFs

- Customer and inventory forms include **عکس (اختیاری)**. Upload JPG, PNG or WebP up to 5 MB, replace it or remove it. The server validates the actual image, removes metadata and stores a resized WebP. Thumbnails appear in lists and larger photos in record details.
- Every sale row has **چاپ بل / PDF**; every receipt in a customer account has **چاپ رسید / PDF**. Open the document, then choose **دانلود PDF** for a file you can send to the customer, or **چاپ / ذخیرهٔ PDF** for the browser print dialog.
- Browser printing and downloaded PDFs use **A4 portrait (210 × 297 mm)**. PDF files are generated locally with embedded Dari fonts and RTL layout. They do not require an external PDF service. Receipts have unique numbers, allocated invoice numbers, and customer/currency/balance snapshots captured at payment time. Older receipts without balance snapshots omit those values.
- Individual invoices and receipts share one document template across preview, browser printing and PDF download: store details, bill/receipt number and date, customer details, an item/allocation table, payment totals, and blank signature spaces. The invoice clearly separates payment at sale, subsequent payments and current amount due. The compact table fits portrait paper without horizontal scrolling.
- Customer statements use the same design, with separate purchases and later-payment tables, account totals and signature spaces. **چاپ صورت‌حساب** loads the complete customer history from one consistent database snapshot; **دانلود PDF** creates a portrait A4 document, continuing onto additional pages for long histories. Initial payments and later receipts are shown separately and counted only once in total payments.
- Uploaded photos live in `.data/uploads` by default. Include this directory with database backups. `UPLOAD_DIR` can point to another persistent directory. Removing a photo from a record does not delete its file because another record may use it.
- The optional `node scripts/configure-demo-usd.mjs` migration backs up the previous demo settings and financial records under `.data/backups`, then relabels only seeded demo records as USD. It refuses a ledger containing non-seed sales or payments. It is not an exchange-rate conversion and must not be used for real transactions.

## Receiving a truckload

In **موجودی**, choose **ثبت ورود اجناس**. Enter the supplier, delivery reference and arrival date once, then add groups of stock:

1. For identical rolls, enter type, color, width, length and quantity. Quantity `20` creates 20 separately numbered rolls. A separate product name is optional.
2. Use **همین جنس با رنگ یا اندازهٔ دیگر** to copy a group, then change its color, quantity or dimensions. Use **افزودن جنس دیگر** for a different product. Only one group is expanded at a time; click a previous group's summary to edit it.
3. For different lengths, check **طول رول‌ها یکسان نیست** and enter `30, 28, 25.5, 32` (or one number per line). Each number creates one roll; quantity is counted automatically.
4. Optionally enter purchase cost and suggested selling price **per linear meter**, plus row notes. Negotiated customer prices still work independently.
5. Choose **بررسی محموله**, check all groups and the total roll count, then save. The delivery and its rolls commit in one transaction. An invalid row prevents the whole batch from saving, and retrying the same request does not duplicate stock.

The popup opens with an example and the basic fields for one group. A special product name, suggested selling price, notes, supplier details and Excel import are optional expandable sections. When no special name is entered, the product type is used as its name. The popup accepts up to **200 groups / 1000 physical rolls** per delivery. Each roll retains its own remaining length; partial sales affect only the selected roll. Delivery number, reference and supplier appear in the inventory detail popup. The original single-record popup remains available through **افزودن رکورد**.

Each group in **ثبت ورود اجناس** has an optional photo picker. Upload one photo for all rolls in that group; different colors or types can have their own photos. Duplicating a group copies its photo, which you can replace or remove independently before reviewing and saving. Photos also appear in the delivery review and on the resulting inventory records.

### Excel import

Expand **لیست Excel دارید؟** in the delivery popup and download **دانلود نمونهٔ Excel**. Replace the example rows with the supplier's list, then choose **واردکردن فایل Excel**. Imported rows are added to your draft and remain editable; uploading a file never writes inventory.

Use `.xlsx` files up to **2 MB**, with headers on the first row of the first worksheet. Supported columns are `vinylName`, `type`, `color`, `length`, `width`, `quantity`, `lengths`, `costPrice`, `sellingPrice`, `details`. The equivalent Dari headers are `نام`, `نوع`, `رنگ`, `طول`, `عرض`, `تعداد`, `طول‌ها`, `قیمت خرید`, `نرخ پیشنهادی`, `توضیحات`. Type, color and width headers are required; a missing name defaults to the type, and a missing quantity defaults to 1 for equal-length groups. Use plain values rather than formulas, English digits and decimal points. For a `lengths` list, leave both `length` and `quantity` empty. Fill in supplier, reference and date in the popup, not in the spreadsheet.

## Selling several rolls on one bill

In **فروشات → فروش جدید**, select the customer once and add the first item. Use **افزودن جنس دیگر** for each additional roll. Every item has its own roll, length, pricing method, customer price and optional saved rate. **تمام رول** fills the available length; **حذف جنس** removes an unwanted item. Up to 100 items can share a bill.

Enter one payment for the entire bill, then choose **تکمیل فروش**. The server calculates each item's amount, totals the bill, applies customer credit once, and deducts each roll's stock in one transaction. If any item is unavailable, nothing is recorded. Repeated requests cannot duplicate the sale, and multiple cuts from the same roll cannot exceed its combined available length.

The invoice/PDF lists all items and one payment summary. Longer bills continue onto additional A4 pages. Customer statements, receipts, reports and exports count the invoice totals once. Existing single-item bills remain readable without rewriting history. The sales API accepts `items: [{ vinylId, soldLength, pricingMethod, unitPrice, rememberPrice? }]` plus invoice-level `customerId`, `paidAmount`, `soldDate` and `notes`; the previous single-item payload is still accepted. For two items of the same type/unit, save only one customer rate if their prices differ.

Administrators and managers can select rows in Customers, Inventory and Sales and choose **حذف انتخاب‌شده‌ها**, or delete one row. Select-all applies only to the current page; changing filters or pages clears the selection. A batch is atomic: an invalid record prevents the entire batch from changing.

Customer deletion removes the customer from active lists; use **مشتریان حذف‌شده** to access their preserved account, receipts and balances. Inventory records with active sales cannot be removed until those sales are deleted. Sale deletion restores sold lengths, cancels its initial payment in the ledger, and adjusts customer debt/credit. Separate receipts remain unchanged; released payments settle other open bills or become credit. No cash refund is issued automatically. Deleted invoice snapshots and audit events are retained, and retrying an old sale request cannot recreate it.

## Customer-specific prices

Each customer can have a separate saved price for each **carpet/flooring type and pricing method**. Linear-meter and square-meter rates are independent.

- On the customer account, use **نرخ‌های اختصاصی مشتری** to add, edit or remove rates. Enter the same type name used in inventory; surrounding whitespace is trimmed.
- In **فروش جدید**, selecting the customer and roll loads the customer's saved rate for that type. If no linear-meter rate exists, the roll's suggested price is used. Square-meter prices must be entered explicitly if no rate is saved.
- The unit price remains editable on every sale. Choose **ذخیرهٔ این نرخ برای این مشتری و این نوع فرش و قالین** to remember the negotiated price after the sale succeeds. Leave it unchecked for a one-time price.
- Switching customers or pricing methods reloads the appropriate suggestion. Walk-in customers have no saved rates.
- Saving a rate with a sale happens in the same database transaction. Failed sales do not update rates. Editing/deleting saved suggestions never changes previous invoices or the roll's suggested price.

Rates use the store currency. The new `CustomerPrice` collection and its compound unique index are created automatically on startup; existing sales and inventory need no migration or reseeding.

Rate API: `GET/PUT /api/customers/:id/prices`, `DELETE /api/customers/:id/prices/:priceId`. The list is paginated and accepts `type` and `pricingMethod` filters. PUT accepts `type`, `pricingMethod` (`linear` / `area`) and positive `unitPrice`. Sales optionally accept `rememberPrice: true`; `unitPrice` is always the explicit price charged on that invoice.

## Requirements

- Node.js **22.12 or newer** (tested with Node 24).
- MongoDB **7 or newer**, configured as a replica set. A single-node local replica set is enough.
- Internet access for initial npm installation and, if using the included local database launcher, the first MongoDB binary download.
- Playwright Chromium for PDF generation and browser tests. Install it with `npx playwright install chromium`; Linux hosts may also need `npx playwright install --with-deps chromium`.

No Docker or extra infrastructure is needed.

## Quick start

From the project root:

```sh
npm install
npx playwright install chromium
```

The root uses npm workspaces and installs both applications. You can also run `npm install` inside `backend` and `frontend` individually; the root installation is required for the bundled database launcher and tests.

Create the backend configuration:

```powershell
Copy-Item backend/.env.example backend/.env
```

On macOS/Linux, use `cp backend/.env.example backend/.env` instead.

**Everyday startup — one terminal:**

```sh
npm run dev
```

This starts the persistent local MongoDB automatically if needed, then the API and frontend. It reuses an already running replica set. Keep this terminal open; Ctrl+C stops its services without deleting records. An unavailable custom `MONGO_URI` produces an error rather than silently switching databases. If port 5000 or 5173 is already occupied, close the previous store server first.

**First-time setup only — start MongoDB in Terminal 1:**

```sh
npm run db
```

This downloads a real MongoDB binary if needed and launches a persistent, local, single-node replica set named `rs0` on port **27017**. Data is stored in `.data/mongo`; it survives restarts. Keep this terminal open. Do not delete `.data` if you need the stored records. If MongoDB already occupies port 27017, use your existing replica set and update `MONGO_URI` instead of running this command.

**First-time setup, Terminal 2 — optional sample data, first administrator, then both applications:**

```sh
npm run seed
npm run admin:create
npm run dev
```

Open **http://127.0.0.1:5173** (or http://localhost:5173).

`admin:create` runs once per database and reads `backend/.env`. It creates username `admin` and saves a random temporary password in an ignored `.data/initial-admin-*.txt` file. Open the path printed by the command, log in directly, then delete that credential file. Existing stores should skip `seed`; creating the first administrator preserves all existing records. The bootstrap refuses to run if any account already exists.

## Users and permissions

All store pages, APIs, photos, PDF downloads and live updates require login. There is no public registration. In **مدیریت کاربران**, an administrator creates accounts, assigns roles, resets passwords and activates/deactivates accounts. Correct passwords grant access immediately, including newly created and reset accounts. Password changes remain available from the account page. Accounts are deactivated instead of deleted to preserve transaction history.

| Capability | Admin — مدیر سیستم | Manager — مدیر | Staff — کارمند |
| --- | --- | --- | --- |
| Customers, sales, receipts, printing | Yes | Yes | Yes |
| View stock and selling prices | Yes | Yes | Yes |
| Receive/edit/archive inventory; view purchase costs | Yes | Yes | No |
| Reports and bulk CSV/Excel exports | Yes | Yes | No |
| Store settings, users and audit history | Yes | No | No |

Permissions are enforced by the API as well as the interface. The last active administrator cannot be demoted or deactivated. Editing a user's account or changing/resetting their password revokes their sessions and live connections. Every user can change their own password from their account page. Use another administrator to reset a forgotten password.

Passwords use salted scrypt hashes. Administrators can set session duration in Settings from 5 to 10080 minutes (7 days), with a default of 480 minutes (8 hours). This applies to every role, including administrators, for new logins; existing sessions keep their original expiration. Sessions use a fixed lifetime from login, not an inactivity timer. Sessions use HttpOnly, SameSite cookies; production cookies also require HTTPS. Writes require a session-specific CSRF token. Login attempts are limited per account and IP within each API process. Sessions survive API restarts; the in-memory login limiter resets on restart. Login API clients must send `X-Requested-With: store-app`, retain the returned cookie, and send the response's `csrf` value as `X-CSRF-Token` on subsequent writes.

New records store the responsible user; financial changes and their audit events commit together. The admin audit page shows actions and actors. Older records remain intact and display **رکورد قبلی** where no creator was recorded. Invoice/receipt printouts include the recorded creator. Retry keys are scoped to the logged-in user.

For an explicitly named first administrator, `npm run admin:create -- --file <path>` accepts a local JSON file containing `username`, `name` and `password` (12–128 characters). Keep that file outside Git and remove it after setup. The normal generated-password command requires no file preparation.

- Frontend: port **5173**.
- Backend: http://127.0.0.1:5000.
- Health: http://127.0.0.1:5000/api/health.

For an existing store, `cd backend && node scripts/add-samples.mjs` adds the named `samples-20260929-v1` batch: 6 customers, 8 rolls in one delivery, 6 sales and 3 receipts. Names start with **نمونه**. It preserves existing store settings and records, uses the current currency, and reuses the same batch on retries. Samples affect reports and balances like normal records.

The seed creates 15 realistic flooring rolls, 5 customers, 10 sales and 3 receipts through the business services. It refuses to modify a nonempty database. Skip it when starting an actual store ledger.

To start the apps separately:

```sh
cd backend
npm install
npm run dev
```

In another terminal:

```sh
cd frontend
npm install
npm run dev
```

Stop a process with Ctrl+C. Restart the database and applications using the same commands.

Vite waits for the API health check before opening its development server. `Restarting 'server.js'` is normal when Node's development watcher detects a backend or shared-file change. During a restart, the development proxy waits up to 15 seconds for the API and reconnects Socket.IO. Interrupted reads can retry; forwarded writes are never automatically replayed. Lists retain their existing records and retry temporary connection failures automatically. A longer outage returns a clear 503 error instead of an empty proxy response. Keep `npm run db` running; if you change the API port, set `VITE_API_TARGET` to its matching address. Initial startup still stops with instructions if the API is unavailable for 60 seconds. After updating the Vite configuration or dependencies, restart `npm run dev` once.

## Environment variables

See [backend/.env.example](backend/.env.example). The server reads `backend/.env` when run through the supplied scripts.

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/vinyl_store?replicaSet=rs0
PORT=5000
HOST=127.0.0.1
CLIENT_URL=http://localhost:5173
TZ=Asia/Kabul
```

`TZ` controls business-day boundaries for dashboard/report totals. MongoDB stores UTC timestamps. Date-only form entries are stored at UTC midnight; within the default Afghanistan timezone they retain the entered business date. Keep browser and server in the store's timezone when operating the application.

The frontend uses relative API URLs through Vite's proxy. To change the backend proxy address, set `VITE_API_TARGET` in the shell before starting Vite. The browser needs no database credentials.

Never commit `.env` or credentials.

## Using an installed MongoDB server

Instead of `npm run db`, install MongoDB Community Server, create a data directory and run:

```sh
mongod --dbpath /absolute/path/to/your/data --replSet rs0 --bind_ip 127.0.0.1 --port 27017
```

Initialize once with `mongosh`:

```javascript
rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] });
```

Wait for the node to become primary, then start the backend. An Atlas replica set also works by changing `MONGO_URI`. Startup checks transaction support and refuses a standalone MongoDB server; there is deliberately no unsafe partial-write fallback.

## Store workflow

1. Configure the store name, address, phone, currency, default width and stock threshold in **Settings**.
2. Add a roll. Roll numbers are assigned automatically and never renumbered or reused.
3. Add a customer, or choose walk-in for fully paid sales.
4. In **فروشات**, click **فروش جدید** to open the sale popup. Select a roll, enter length and choose linear-meter or square-meter pricing. Use **افزودن جنس دیگر** for additional rolls with their own lengths and prices, then enter one payment for the whole bill. Cancel returns to the list; completing the sale opens its invoice. Sale shortcuts from inventory, customer accounts and the dashboard also open the popup with any selected roll/customer filled in.
5. Review the invoice. Stock and debt have already been updated atomically.
6. Record subsequent payments from the customer account. Receipts settle the oldest unpaid invoices first.
7. Use **Reports** for date-filtered sales, inventory cost value and customer debt.

**Example:** A 30 m roll sold in cuts of 8 m and 10 m retains 12 m. An attempted 20 m sale is rejected. A 5,000 USD sale paid with 2,000 USD adds 3,000 USD debt; a 1,000 USD receipt reduces it to 2,000 USD.

### Accounting and inventory rules

- Length/width accept up to three decimals; money accepts two decimals. Decimal arithmetic computes totals; customer debt is stored as integer minor units and exposed as `balance`.
- Inventory cost/selling prices are **per linear meter**. The sale screen additionally supports an explicitly entered price per square meter.
- Zero remaining length means sold. Positive stock below the configured threshold means low stock.
- After a roll has sales, its dimensions cannot be manually rewritten. Add a new roll for new stock.
- Archiving requires confirmation and is permitted only for rolls with no sales. The record and roll number remain stored.
- Financial records have no update/delete endpoints. Initial sale payment, snapshots and receipts remain in history. Current invoice `remainingBalance` changes when receipts are allocated.
- A sale's payment type describes the original transaction. A partial invoice may later show zero due; the original partial payment remains visible.
- Walk-in sales require full payment. A sale's immediate payment cannot exceed its total; use **ثبت رسید** in the customer account for additional money. A receipt may exceed the debt or be entered with no debt: it settles oldest invoices first and stores the excess as **طلب مشتری**. For example, a 150 USD receipt against 100 USD debt leaves 50 USD customer credit. Zero and negative receipts are rejected.
- Positive customer `balance` means debt; negative means customer credit. Screens and printed documents label credit as **طلب مشتری** with a positive displayed amount. Future sales automatically use available credit against the amount unpaid at sale, storing `creditApplied` separately from new cash. Receipt `creditAmount` and before/after snapshots remain historical. Reusing credit does not count as another receipt or payment in customer totals. Dashboard debt excludes customer credit, which is shown separately.
- Currency is locked after the first sale or receipt. All currencies use two decimal places in this application.
- Revenue means invoiced sales, not cash receipts. Sales reports show current settlement of invoices within the chosen sale-date range, including later receipts.
- Duplicate sale/payment requests with the same idempotency key return the original result. Reusing a key with different data is rejected.

### Search, export and printing

Sales, customers, and inventory have **جدول (پیش‌فرض)**, **شبکه‌ای**, and **ردیفی** view controls. Each list remembers its own choice in this browser. Search, filters, pagination, photos, and record actions work in every view; invoices and printed documents keep their document layout.

Search, filtering, sorting and pagination happen on the server. Searches match names, roll/bill numbers, types, colors, phones and entry dates as appropriate. Inventory filters include type, color, status, date and length; sales filters include customer, date, vinyl, roll and original payment type.

**CSV** and **Excel** export all matching records, independent of the displayed page. Exports are streamed on the backend and protect text cells against spreadsheet formula injection. Customer exports include lifetime purchases, paid amounts and debt.

Invoice, receipt and customer-statement previews offer **دانلود PDF** for a direct download and **چاپ / ذخیرهٔ PDF** for browser printing. Statements include the complete customer history. Sales reports use browser printing/Save as PDF and load all matching pages before printing. Very large print documents can use significant browser memory; use a narrower report range or streamed CSV/Excel export for large datasets.

## Tests and build

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Backend tests start a disposable MongoDB replica set. They cover partial/full sales, oversell rejection, transaction rollback after a simulated storage failure, concurrent sales and payments, idempotent retries, decimal prices, snapshots, debt/receipt reconciliation, CRUD, validation, search, filters, pagination, aggregates, exports and archive safety. Additional coverage verifies customer-specific rates, Dari output, image validation/resizing and persistence, receipt snapshots, and actual PDF downloads.

Multi-item sale tests cover mixed pricing methods, repeated-roll stock limits, concurrent baskets, full rollback, customer credit, totals counted once, legacy invoices and multi-page A4 PDFs. Delivery tests verify that each group's photo is applied to all of its generated rolls. Browser tests also check copying, replacing and removing group photos independently, whole-roll selection and one invoice for several items.

Browser tests launch their own disposable database, API on **5002** (override with `UI_TEST_API_PORT`), and frontend on **5174**. They exercise inventory/customer creation and editing, photo uploads, customer-specific prices, sales, payments, invoice/receipt PDF downloads, statement printing, reports, settings and mobile layouts. They fail on browser console errors and horizontal page overflow. Test databases and uploaded test images are separate from the store. Artifacts go in `test-results/`. To exercise HTTP access through a network IP (including delivery, sale and receipt forms), run `UI_TEST_HOST=<machine-LAN-IP> npm run test:ui`. Test ports must be free.

`npm run build` creates `frontend/dist`. The supplied development setup is intended for local use. For deployment, serve that build from a web server and reverse-proxy `/api` and `/socket.io` to Express. Vite preview is only a build preview; it is not the documented full-stack production host.

## Project structure

```text
backend/
  config/         Database connection and transaction support check
  models/         VinylRoll, Delivery, Customer, CustomerPrice, Sale, Payment, Settings, Counter
  controllers/    Request validation and response handling
  routes/         REST endpoints
  services/       Transactions, inventory, sales, receipts, PDFs, reports, exports
  middleware/     Central error handling
  utils/          Validation, money, queries and invoice sequences
  tests/          Integration and concurrency tests
  app.js          Express application
  server.js       HTTP and Socket.io server
  seed.js         Non-destructive sample data script
frontend/src/
  components/     Reusable tables, fields, dialogs, lookups, print views
  pages/          Dashboard, inventory, sales, customers, reports, settings
  services/       API client, shared store state and live refresh
  utils/          Formatting and form helpers
scripts/          Persistent local MongoDB launcher and demo-only USD migration
tests/            Browser workflow tests
docs/design.md    Reference review, schema relationships and integrity design
```

## API

Successful responses: `{ "success": true, "data": ... }`.
Errors: `{ "success": false, "error": { "message": "..." } }` with a meaningful HTTP status.
List payloads contain `items`, `total`, `page`, `limit`, and `pages`. Default page size is 15, maximum 100.

| Resource   | Endpoints                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Inventory  | `GET/POST /api/vinyl`, `GET/PUT/DELETE /api/vinyl/:id`                                                         |
| Customers  | `GET/POST /api/customers`, `GET/PUT /api/customers/:id`                                                        |
| Sales      | `GET/POST /api/sales`, `GET /api/sales/:id`                                                                    |
| Payments   | `GET/POST /api/payments`, `GET /api/payments/:id`                                                              |
| PDFs       | `GET /api/sales/:id/pdf`, `GET /api/payments/:id/pdf`                                                          |
| Photos     | `POST /api/images` (multipart field `image`), `GET /api/images/:filename`                                      |
| Deliveries | `POST /api/deliveries`, `GET /api/deliveries/template`, `POST /api/deliveries/import` (multipart field `file`) |
| Prices     | `GET/PUT /api/customers/:id/prices`, `DELETE /api/customers/:id/prices/:priceId`                               |
| Dashboard  | `GET /api/dashboard/summary`                                                                                   |
| Reports    | `GET /api/reports/sales`, `/inventory`, `/customers`                                                           |
| Export     | `GET /api/exports/{vinyl,sales,customers,payments}?format=csv` or `xlsx`                                       |
| Settings   | `GET/PUT /api/settings`                                                                                        |

`POST /api/sales`, `POST /api/payments` and `POST /api/deliveries` require an `Idempotency-Key` header (8–100 characters). Retain the same key when retrying an uncertain request. Sale inputs: `items` (1–100 entries containing `vinylId`, `soldLength`, `pricingMethod` (`linear`/`area`), `unitPrice`, optional `rememberPrice`), invoice-level `paidAmount`, and optional `customerId`, `soldDate`, `notes`. The legacy single-item payload accepts the item fields at the top level instead of `items`; do not mix both formats. Payment inputs: `customerId`, positive `amount`, `paymentMethod` (`cash`/`bank`/`other`), optional `date`, `details`, and `reference`.

Delivery inputs: `entryDate`, optional `supplier` and `reference`, and `rows`. Each row accepts inventory name/type/color/width, optional `img` photo URL, per-meter prices and notes, and either `length` plus integer `quantity` or a `lengths` array. Upload photos through `/api/images` first and include the returned URL as `img`; all rolls generated from that row share the photo. The response includes the delivery number, physical roll count and first/last roll numbers. Excel import returns editable draft rows only; add photos in the popup after import. Validation at save time applies to the entire delivery.

Customer details include `customer`, paginated `purchases`, paginated `receipts`, and lifetime `summary`; use `purchasePage` and `paymentPage` independently. `GET /api/sales?customerId=...` and `/api/payments?customerId=...` also provide histories.

Socket.io broadcasts `store:changed` after successful writes. The UI then refetches REST data. Reads/writes continue through REST if the live connection is temporarily unavailable.

## Local operation, backups and limitations

This application binds to loopback by default and includes authenticated role-based access. Network deployments require HTTPS with `NODE_ENV=production`, an exact `CLIENT_URL`, and a properly configured reverse proxy. Do not expose MongoDB publicly. The built-in login limiter is process-local; multi-instance deployments need a shared limiter.

Administrators can use **تنظیمات → بکاپ کامل و بازیابی** to download a `.vinyl-backup.gz` file containing every application data collection and uploaded photo: inventory, customers (including removed customers), sales, receipts, deliveries, saved prices, numbering counters, users/password hashes, settings, audit history, and deleted-sale snapshots. This is separate from CSV/Excel report exports. Keep backup files private; they contain account credentials in hashed form and all store data. Configuration, source code, generated PDFs, and active login sessions are not included. PDFs can be regenerated from restored records.

To restore, select a backup, choose **بررسی فایل بکاپ**, review the counts, then explicitly confirm **بازیابی این بکاپ**. The file must be this application's version-1 format; compressed size is limited to 100 MB and expanded size to 256 MB. Integrity, required collections, user accounts, linked records, counters, and photo paths/content are validated before replacing data. Store requests temporarily pause while a consistent backup or restore runs. This maintenance gate assumes the supplied single API process; do not restore through multiple independent API workers.

Before replacement, the server writes a safety backup under `.data/backups` (override with `BACKUP_DIR`). Admins can download the ten most recent safety backups from Settings. Database replacement runs in one MongoDB transaction; a failed transaction keeps the current records. Missing photos are restored before the commit, existing photos are never overwritten, and unreferenced existing photos may remain. A conflicting same-name photo causes restore to stop. All sessions are revoked after a successful restore, so sign in with an administrator account and password from the imported backup.

No automatic backup scheduler is included. Save copies off this machine regularly. For stores beyond the in-app size limits, use MongoDB Database Tools (`mongodump` / `mongorestore`) and copy `.data/uploads` (or `UPLOAD_DIR`); verify restoration in a separate environment.

The repository excludes local configuration (`.env`), database files, uploaded photos, backups, dependencies, build output and test artifacts. A fresh clone needs the setup steps above; pushing the source code does not back up the store's records or photos.

Financial corrections/returns are not implemented; invoices and receipts cannot be deleted from the UI. Establish a reviewed correction process before entering real financial records that may need reversals.

The last dependency audit reported two moderate findings in ExcelJS's transitive UUID dependency (and the parent package), with no high or critical findings. The advisory concerns UUID v3/v5/v6 buffer handling; ExcelJS uses v4 here. Review dependency updates before network deployment.

## Reference

The [VinylRecords repository](https://github.com/Omidcr77/VinylRecords) informed the domain fields and store workflow. The new implementation retains recognizable names but replaces whole-roll deletion, renumbering, disconnected balances and static dashboard figures. See [the design notes](docs/design.md) for the review and relationships.
