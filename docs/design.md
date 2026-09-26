# Design and reference review

Reviewed https://github.com/Omidcr77/VinylRecords: the three models, all routes, inventory JavaScript, sold records, customer details and dashboard.

The original retains useful roll/name/type/color/dimensions/date fields and customer purchases/receipts concepts. Its sale route deletes the whole roll, renumbers remaining rolls, and does not coordinate debt with stock. Customer routes accept arbitrary balance changes and negative receipts. The dashboard contains sample constants. This implementation starts fresh and does not copy those behaviors.

## Relationships

- VinylRoll → many Sales; a roll remains after partial or complete sales. Stable sequential roll numbers are never reused. Deletion means archival.
- Customer → many Sales and Payments. Walk-in cash sales have no customer. Unpaid sales require a customer.
- Customer → many CustomerPrices, uniquely keyed by customer, trimmed vinyl type and pricing method. These are editable suggestions; every Sale keeps its own immutable charged unit price. A sale can optionally save its negotiated rate in the same transaction, while a one-time override does not update the suggestion.
- Sale → one VinylRoll and optionally one Customer. Product, customer and currency snapshots preserve invoice history.
- Payment → one Customer, with immutable allocation entries referencing Sales. Payments settle oldest outstanding invoices first. Initial sale payments remain on the sale; subsequent receipts are separate.
- Settings → one singleton holding store identity, currency, stock threshold, default width and invoice footer.
- Counter → atomic roll and yearly invoice sequences.

## Integrity

All multi-document writes use MongoDB transactions; a replica set is required, including a single-node local replica set. Startup refuses a standalone server rather than allowing partially committed sales. The included local database command starts a persistent single-node replica set without Docker.

Money is calculated with decimal arithmetic and stored as integer minor units for customer debt. User-facing monetary fields use two decimal places. Lengths accept three decimal places. Sales and receipts require idempotency keys; replaying the same request returns the original record, while reuse for a different request is rejected. Stock deduction is conditional and transactional. Failed writes roll back counters, inventory, sale and debt together.

Financial records have no delete or edit endpoint. Initial paid amounts are immutable; current remaining balances reflect allocated receipts. Inventory with sales cannot have its dimensions manually rewritten. Archive is permitted only for rolls with no sales. Settings currency cannot change after financial activity. Business dates and report boundaries use the configured server TZ (Asia/Kabul by default); timestamps are stored as UTC dates.

Lists use server pagination, allowlisted sorts and escaped search expressions. Aggregations supply totals. Reports and exports apply the same filters. The app is intended for a trusted local store computer, binds the API to loopback by default, and has no user authentication. Remote deployment requires authentication and TLS.
