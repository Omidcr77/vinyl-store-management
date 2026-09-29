import { lockSettings } from "../services/inventoryService.js";
import Supplier from "../models/Supplier.js";
import SupplierEntry from "../models/SupplierEntry.js";
import Settings from "../models/Settings.js";
import {
  supplierInput,
  supplierEntryInput,
  supplierReversalInput,
  id,
  keyInput,
} from "../utils/validation.js";
import { list, regex, dateRange } from "../utils/query.js";
import { required } from "../utils/errors.js";
import { transaction } from "../services/transaction.js";
import { actorFields } from "../services/actor.js";
import {
  supplierTransaction,
  reverseSupplierEntry,
} from "../services/supplierService.js";
import { sendDocumentPdf } from "../services/documentService.js";
import { dateText } from "../../shared/calendar.js";
import { supplierKinds } from "../../shared/suppliers.js";
const send = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
const changed = (req) => req.app.get("io")?.emit("store:changed");
export async function supplierList(req, res) {
  const filter = req.query.search
    ? {
        $or: [
          { name: regex(req.query.search) },
          { phone: regex(req.query.search) },
        ],
      }
    : {};
  const data = await list(Supplier, filter, req.query, [
    "name",
    "balanceMinor",
  ]);
  const [totals] = await Supplier.aggregate([
    {
      $group: {
        _id: null,
        payable: { $sum: { $max: ["$balanceMinor", 0] } },
        receivable: {
          $sum: { $max: [{ $multiply: ["$balanceMinor", -1] }, 0] },
        },
      },
    },
  ]);
  send(res, {
    ...data,
    summary: {
      payable: (totals?.payable || 0) / 100,
      receivable: (totals?.receivable || 0) / 100,
    },
  });
}
export async function supplierSave(req, res) {
  const input = supplierInput.parse(req.body);
  const data = await transaction(async (session) =>
    req.params.id
      ? required(
          await Supplier.findByIdAndUpdate(
            id.parse(req.params.id),
            { ...input, ...actorFields() },
            { new: true, session, runValidators: true },
          ),
        )
      : (
          await Supplier.create(
            [
              {
                ...input,
                currency: (await Settings.findById("store").session(session))
                  .currency,
                ...actorFields(true),
              },
            ],
            { session },
          )
        )[0],
  );
  changed(req);
  send(res, data, req.params.id ? 200 : 201);
}
export async function supplierGet(req, res) {
  const supplierId = id.parse(req.params.id);
  const supplier = required(await Supplier.findById(supplierId));
  const filter = { supplierId };
  const range = dateRange(req.query.from, req.query.to);
  if (range) filter.date = range;
  send(res, {
    supplier,
    entries: await list(SupplierEntry, filter, req.query, [
      "createdAt",
      "date",
    ]),
  });
}
export async function entryCreate(req, res) {
  const data = await supplierTransaction(
    id.parse(req.params.id),
    supplierEntryInput.parse(req.body),
    keyInput.parse(req.get("Idempotency-Key")),
  );
  changed(req);
  send(res, data, 201);
}
export async function entryReverse(req, res) {
  const data = await reverseSupplierEntry(
    id.parse(req.params.id),
    id.parse(req.params.entryId),
    supplierReversalInput.parse(req.body),
    keyInput.parse(req.get("Idempotency-Key")),
  );
  changed(req);
  send(res, data, 201);
}
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function supplierStatement(req, res) {
  const supplier = required(await Supplier.findById(id.parse(req.params.id)));
  const settings = await Settings.findById("store");
  const entries = await SupplierEntry.find({ supplierId: supplier._id })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  const rows = entries.map((e) => [
    dateText(e.date, settings.calendar),
    supplierKinds[e.kind],
    e.reference || "",
    e.deltaMinor > 0 ? e.amount : "",
    e.deltaMinor < 0 ? e.amount : "",
    e.balanceAfter,
    e.details || "",
  ]);
  const headers = [
    "تاریخ",
    "معامله",
    "مرجع",
    "افزایش قرض ما",
    "کاهش قرض / افزایش طلب ما",
    "مانده پس از ثبت",
    "توضیحات",
  ];
  if (req.query.format === "csv") {
    const cell = (v) =>
      `"${String(/^[=+\-@\t\r\n]/.test(String(v)) ? `'${v}` : v).replaceAll('"', '""')}"`;
    return res
      .type("text/csv; charset=utf-8")
      .attachment(`supplier-${supplier._id}.csv`)
      .send(
        "\uFEFF" +
          [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n"),
      );
  }
  const markup = `<html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Vazirmatn,sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:right}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>${esc(settings.storeName)}</h1><h2>صورت‌حساب تهیه‌کننده: ${esc(supplier.name)}</h2><p>${esc(supplier.phone)} · ${esc(supplier.currency)}</p><p>مانده فعلی: ${esc(Math.abs(supplier.balance))} — ${supplier.balance >= 0 ? "قرض ما به تهیه‌کننده" : "طلب ما از تهیه‌کننده"}</p><p>ترتیب ثبت معاملات؛ مبلغ مثبت مانده = قرض ما، منفی = طلب ما. معاملات لغوشده با ثبت معکوس محفوظ‌اند.</p><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  return sendDocumentPdf(res, markup, `supplier-${supplier._id}`);
}
