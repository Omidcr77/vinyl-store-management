import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateText,
  parseDate,
  formatDate,
  monthStart,
} from "../shared/calendar.js";
import { renderBill, renderStatement } from "../shared/bill.js";
test("Persian dates round-trip with English digits, leap days and Kabul day boundaries", () => {
  for (const [iso, persian] of [
    ["2026-09-28", "1405/07/06"],
    ["2024-03-20", "1403/01/01"],
    ["2025-03-20", "1403/12/30"],
    ["2025-03-21", "1404/01/01"],
  ]) {
    assert.equal(dateText(iso, "persian"), persian);
    assert.equal(parseDate(persian, "persian"), iso);
  }
  assert.equal(parseDate("1404/12/30", "persian"), "");
  assert.equal(parseDate("1405/07/31", "persian"), "");
  assert.equal(parseDate("2026/02/30", "gregory"), "");
  assert.equal(parseDate("1405/13/01", "persian"), "");
  assert.equal(monthStart("2026-09-28", "persian"), "2026-09-23");
  assert.equal(dateText("2026-09-27T20:00:00Z", "persian"), "1405/07/06");
  assert.ok(!/[۰-۹٠-٩]/.test(formatDate("2026-09-28", "persian")));
});
test("printed receipts and statements honor the selected calendar without changing records", () => {
  const record = {
    receiptNumber: "RCP-2026-1",
    date: "2026-09-28",
    amount: 1,
    allocations: [],
    customerName: "Test",
  };
  const settings = { calendar: "persian" };
  const html = renderBill({
    record,
    settings,
    receipt: true,
    generatedAt: "2026-09-28",
  });
  assert.ok(html.includes("1405"));
  assert.ok(html.includes("RCP-2026-1"));
  assert.ok(
    renderBill({
      record,
      settings: { calendar: "gregory" },
      receipt: true,
    }).includes("2026"),
  );
  const statement = renderStatement({
    customer: { name: "Test" },
    settings,
    summary: { balance: 0 },
    generatedAt: "2026-09-28",
  });
  assert.ok(statement.includes("1405"));
  assert.equal(record.date, "2026-09-28");
});
