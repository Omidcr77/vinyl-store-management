import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBill } from "../../shared/bill.js";
const sale = {
  billNumber: "INV-2026-000001",
  customerName: '<img src=x onerror="alert(1)">',
  vinylName: "Oak",
  type: "Wood",
  color: "Brown",
  rollNumber: 1,
  soldLength: 3,
  width: 4,
  area: 12,
  pricingMethod: "area",
  pricePerSquareMeter: 10,
  totalAmount: 120,
  paidAmount: 20,
  remainingBalance: 60,
  soldDate: "2026-09-28",
  currency: "USD",
  notes: "</style><script>bad()</script>",
};
test("shared bill escapes entered text and clearly separates original and later payments", () => {
  const html = renderBill({ record: sale, settings: { storeName: "Shop" } });
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("40.00 USD")); // 120 - 20 - 60, later payments.
  assert.ok(html.includes("60.00 USD"));
  assert.ok(html.includes("فی متر مربع"));
  assert.ok(html.includes("bill-signatures"));
  assert.ok(!html.includes("table-scroll"));
});
test("receipt layout uses historical balances and does not invent them for older receipts", () => {
  const record = {
    receiptNumber: "RCP-1",
    customerName: "Ahmad",
    date: "2026-09-28",
    currency: "USD",
    amount: 10,
    paymentMethod: "cash",
    balanceBefore: 30,
    balanceAfter: 20,
    allocations: [{ billNumber: "INV-1", amount: 10 }],
  };
  const html = renderBill({ record, receipt: true });
  assert.ok(html.includes("30.00 USD"));
  assert.ok(html.includes("20.00 USD"));
  assert.ok(html.includes("INV-1"));
  delete record.balanceBefore;
  delete record.balanceAfter;
  assert.ok(
    !renderBill({ record, receipt: true }).includes("باقی‌داری پس از پرداخت"),
  );
});
