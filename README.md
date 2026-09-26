# فرش و قالین فروشی — Flooring Store Management

A local, full-stack point-of-sale and inventory application built with React, Vite, Tailwind CSS, Lucide, Express, MongoDB/Mongoose and Socket.io.

Manage partial rolls, sales, customers, outstanding balances, receipts, reports, CSV/Excel exports and printable invoices/statements. All screens use the real API. No browser-only sample records are used.

The interface is in **Dari (`fa-AF`) with right-to-left layout**, including mobile navigation, print views, validation messages and exported column headings. Numbers use Dari digits; dates remain Gregorian to match date inputs and report filters. Product names and customer details remain as entered.

The default store name is **فرش و قالین فروشی** and the default currency is **USD**. Each invoice and new payment receipt stores its currency. Currency changes remain blocked after the first sale to protect financial history.

## Photos, printing and PDFs

- Customer and inventory forms include **عکس (اختیاری)**. Upload JPG, PNG or WebP up to 5 MB, replace it or remove it. The server validates the actual image, removes metadata and stores a resized WebP. Thumbnails appear in lists and larger photos in record details.
- Every sale row has **چاپ بل / PDF**; every receipt in a customer account has **چاپ رسید / PDF**. Open the document, then choose **دانلود PDF** for a file you can send to the customer, or **چاپ / ذخیرهٔ PDF** for the browser print dialog.
- PDF files are generated locally with embedded Dari fonts and RTL layout. They do not require an external PDF service. Receipts have unique numbers, allocated invoice numbers, and customer/currency/balance snapshots captured at payment time. Older receipts without balance snapshots omit those values.
- Uploaded photos live in `.data/uploads` by default. Include this directory with database backups. `UPLOAD_DIR` can point to another persistent directory. Removing a photo from a record does not delete its file because another record may use it.
- The optional `node scripts/configure-demo-usd.mjs` migration backs up the previous demo settings and financial records under `.data/backups`, then relabels only seeded demo records as USD. It refuses a ledger containing non-seed sales or payments. It is not an exchange-rate conversion and must not be used for real transactions.

## Customer-specific vinyl prices

Each customer can have a separate saved price for each **vinyl type and pricing method**. Linear-meter and square-meter rates are independent.

- On the customer account, use **نرخ‌های اختصاصی مشتری** to add, edit or remove rates. Enter the same type name used in inventory; surrounding whitespace is trimmed.
- In **فروش جدید**, selecting the customer and roll loads the customer's saved rate for that type. If no linear-meter rate exists, the roll's suggested price is used. Square-meter prices must be entered explicitly if no rate is saved.
- The unit price remains editable on every sale. Choose **ذخیرهٔ این نرخ برای این مشتری و این نوع وینیل** to remember the negotiated price after the sale succeeds. Leave it unchecked for a one-time price.
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

**Terminal 1 — start MongoDB:**

```sh
npm run db
```

This downloads a real MongoDB binary if needed and launches a persistent, local, single-node replica set named `rs0` on port **27017**. Data is stored in `.data/mongo`; it survives restarts. Keep this terminal open. Do not delete `.data` if you need the stored records. If MongoDB already occupies port 27017, use your existing replica set and update `MONGO_URI` instead of running this command.

**Terminal 2 — optional sample data, then both applications:**

```sh
npm run seed
npm run dev
```

Open **http://127.0.0.1:5173** (or http://localhost:5173).

- Frontend: port **5173**.
- Backend: http://127.0.0.1:5000.
- Health: http://127.0.0.1:5000/api/health.

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
4. In **New sale**, select a roll, enter length, choose linear-meter or square-meter pricing, and enter payment.
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
- Walk-in sales require full payment. Overpayments and negative payments are rejected; this version does not maintain customer credit deposits.
- Currency is locked after the first sale. All currencies use two decimal places in this application.
- Revenue means invoiced sales, not cash receipts. Sales reports show current settlement of invoices within the chosen sale-date range, including later receipts.
- Duplicate sale/payment requests with the same idempotency key return the original result. Reusing a key with different data is rejected.

### Search, export and printing

Search, filtering, sorting and pagination happen on the server. Searches match names, roll/bill numbers, types, colors, phones and entry dates as appropriate. Inventory filters include type, color, status, date and length; sales filters include customer, date, vinyl, roll and original payment type.

**CSV** and **Excel** export all matching records, independent of the displayed page. Exports are streamed on the backend and protect text cells against spreadsheet formula injection. Customer exports include lifetime purchases, paid amounts and debt.

Invoice and individual receipt previews offer **دانلود PDF** for a direct download and **چاپ / ذخیرهٔ PDF** for browser printing. Customer statements and sales reports use browser printing/Save as PDF and load all matching pages before printing. Very large print documents can use significant browser memory; use a narrower report range or streamed CSV/Excel export for large datasets.

## Tests and build

```sh
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Backend tests start a disposable MongoDB replica set. They cover partial/full sales, oversell rejection, transaction rollback after a simulated storage failure, concurrent sales and payments, idempotent retries, decimal prices, snapshots, debt/receipt reconciliation, CRUD, validation, search, filters, pagination, aggregates, exports and archive safety. Additional coverage verifies customer-specific rates, Dari output, image validation/resizing and persistence, receipt snapshots, and actual PDF downloads.

Browser tests launch their own disposable database, API on **5001**, and frontend on **5174**. They exercise inventory/customer creation and editing, photo uploads, customer-specific prices, sales, payments, invoice/receipt PDF downloads, statement printing, reports, settings and mobile layouts. They fail on browser console errors and horizontal page overflow. Test databases and uploaded test images are separate from the store. Artifacts go in `test-results/`.

`npm run build` creates `frontend/dist`. The supplied development setup is intended for local use. For deployment, serve that build from a web server and reverse-proxy `/api` and `/socket.io` to Express. Vite preview is only a build preview; it is not the documented full-stack production host.

## Project structure

```text
backend/
  config/         Database connection and transaction support check
  models/         VinylRoll, Customer, CustomerPrice, Sale, Payment, Settings, Counter
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

| Resource  | Endpoints                                                                        |
| --------- | -------------------------------------------------------------------------------- |
| Inventory | `GET/POST /api/vinyl`, `GET/PUT/DELETE /api/vinyl/:id`                           |
| Customers | `GET/POST /api/customers`, `GET/PUT /api/customers/:id`                          |
| Sales     | `GET/POST /api/sales`, `GET /api/sales/:id`                                      |
| Payments  | `GET/POST /api/payments`, `GET /api/payments/:id`                                |
| PDFs      | `GET /api/sales/:id/pdf`, `GET /api/payments/:id/pdf`                            |
| Photos    | `POST /api/images` (multipart field `image`), `GET /api/images/:filename`        |
| Prices    | `GET/PUT /api/customers/:id/prices`, `DELETE /api/customers/:id/prices/:priceId` |
| Dashboard | `GET /api/dashboard/summary`                                                     |
| Reports   | `GET /api/reports/sales`, `/inventory`, `/customers`                             |
| Export    | `GET /api/exports/{vinyl,sales,customers,payments}?format=csv` or `xlsx`         |
| Settings  | `GET/PUT /api/settings`                                                          |

`POST /api/sales` and `POST /api/payments` require an `Idempotency-Key` header (8–100 characters). Retain the same key when retrying an uncertain request. Sale inputs: `vinylId`, optional `customerId`, `soldLength`, `pricingMethod` (`linear`/`area`), `unitPrice`, `paidAmount`, optional `soldDate` and `notes`. Payment inputs: `customerId`, positive `amount`, `paymentMethod` (`cash`/`bank`/`other`), optional `date`, `details`, and `reference`.

Customer details include `customer`, paginated `purchases`, paginated `receipts`, and lifetime `summary`; use `purchasePage` and `paymentPage` independently. `GET /api/sales?customerId=...` and `/api/payments?customerId=...` also provide histories.

Socket.io broadcasts `store:changed` after successful writes. The UI then refetches REST data. Reads/writes continue through REST if the live connection is temporarily unavailable.

## Local operation, backups and limitations

This application is designed for a **trusted local store computer** and binds to loopback by default. It does not implement staff logins or permissions. Add authentication, authorization and TLS before exposing it to other networks.

Back up the MongoDB database regularly with MongoDB Database Tools (`mongodump` / `mongorestore`) and copy `.data/uploads` (or your configured `UPLOAD_DIR`). Verify that both records and photos restore to a separate environment. Table exports are useful reports, but are not complete backups of financial allocation history. No automatic backup scheduler or general legacy-data migration is included.

The repository excludes local configuration (`.env`), database files, uploaded photos, backups, dependencies, build output and test artifacts. A fresh clone needs the setup steps above; pushing the source code does not back up the store's records or photos.

Financial corrections/returns are not implemented; invoices and receipts cannot be deleted from the UI. Establish a reviewed correction process before entering real financial records that may need reversals.

The dependency audit currently reports two moderate findings in ExcelJS's transitive UUID dependency (and the parent package), with no high or critical findings. The advisory concerns UUID v3/v5/v6 buffer handling; ExcelJS uses v4 here. Workbook uploads are not supported. Review dependency updates before network deployment.

## Reference

The [VinylRecords repository](https://github.com/Omidcr77/VinylRecords) informed the domain fields and store workflow. The new implementation retains recognizable names but replaces whole-roll deletion, renumbering, disconnected balances and static dashboard figures. See [the design notes](docs/design.md) for the review and relationships.
