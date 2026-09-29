import ExcelJS from "exceljs";
import VinylRoll from "../models/VinylRoll.js";
import Sale from "../models/Sale.js";
import Customer from "../models/Customer.js";
import Payment from "../models/Payment.js";
import Settings from "../models/Settings.js";
import { dateText } from "../../shared/calendar.js";
import { filterFor } from "../utils/query.js";
import { customerPipeline } from "./reportService.js";
import { AppError } from "../utils/errors.js";
import { money, multiply } from "../utils/numbers.js";
const columns = {
  vinyl: [
    "rollNumber",
    "vinylName",
    "type",
    "color",
    "length",
    "width",
    "area",
    "inventoryValue",
    "entryDate",
    "status",
    "costPrice",
    "sellingPrice",
    "supplier",
  ],
  sales: [
    "billNumber",
    "soldDate",
    "customerName",
    "rollNumber",
    "vinylName",
    "type",
    "color",
    "soldLength",
    "width",
    "area",
    "pricePerMeter",
    "pricePerSquareMeter",
    "totalAmount",
    "paidAmount",
    "creditApplied",
    "remainingBalance",
    "paymentType",
    "currency",
  ],
  customers: [
    "name",
    "phone",
    "address",
    "totalPurchases",
    "totalPaid",
    "balance",
  ],
  payments: [
    "date",
    "customerId",
    "amount",
    "paymentMethod",
    "reference",
    "details",
  ],
};
const safe = (value) => {
  const text =
    value instanceof Date ? value.toISOString() : String(value ?? "");
  return /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
};
const headers = {
  rollNumber: "شمارهٔ رول",
  vinylName: "نام وینیل",
  type: "نوع",
  color: "رنگ",
  length: "طول (متر)",
  width: "عرض (متر)",
  area: "مساحت (متر مربع)",
  inventoryValue: "ارزش خرید موجودی",
  entryDate: "تاریخ ورود",
  status: "وضعیت",
  costPrice: "قیمت خرید فی متر طولی",
  sellingPrice: "نرخ پیشنهادی فی متر طولی",
  supplier: "تهیه‌کننده",
  billNumber: "شمارهٔ بل",
  soldDate: "تاریخ فروش",
  customerName: "نام مشتری",
  soldLength: "طول فروش (متر)",
  pricePerMeter: "نرخ فی متر طولی",
  pricePerSquareMeter: "نرخ فی متر مربع",
  totalAmount: "مبلغ مجموعی",
  paidAmount: "پرداخت هنگام فروش",
  creditApplied: "استفاده از طلب مشتری",
  remainingBalance: "باقی‌داری فعلی",
  paymentType: "نوع پرداخت",
  currency: "واحد پول",
  name: "نام",
  phone: "شمارهٔ تماس",
  address: "آدرس",
  totalPurchases: "مجموع خریدها",
  totalPaid: "مجموع پرداخت‌ها",
  balance: "مانده حساب (مثبت: باقی‌داری؛ منفی: طلب مشتری)",
  date: "تاریخ",
  customerId: "شناسهٔ مشتری",
  amount: "مبلغ",
  paymentMethod: "روش پرداخت",
  reference: "مرجع",
  details: "توضیحات",
};
const cell = (row, key) => {
  if (key === "status")
    return (
      { available: "موجود", "low-stock": "کم‌موجود", sold: "تمام‌شده" }[
        row[key]
      ] || row[key]
    );
  if (key === "paymentType")
    return (
      { cash: "پرداخت کامل", partial: "قسمی", credit: "قرض" }[row[key]] ||
      row[key]
    );
  if (key === "paymentMethod")
    return { cash: "نقد", bank: "بانک", other: "سایر" }[row[key]] || row[key];
  if (key === "customerName" && row[key] === "Walk-in customer")
    return "مشتری گذری";
  return row[key];
};
export async function exportTable(req, res) {
  const { kind } = req.params,
    format = req.query.format || "csv";
  if (!columns[kind] || !["csv", "xlsx"].includes(format))
    throw new AppError("این نوع فایل پشتیبانی نمی‌شود.");
  const filter = filterFor(kind, req.query);
  const calendar =
    (await Settings.findById("store").lean())?.calendar || "gregory";
  const exportCell = (row, key) =>
    ["entryDate", "soldDate", "date"].includes(key) && row[key]
      ? dateText(row[key], calendar)
      : cell(row, key);
  const cursor =
    kind === "customers"
      ? Customer.aggregate(customerPipeline(filter)).cursor()
      : { vinyl: VinylRoll, sales: Sale, payments: Payment }[kind]
          .find(filter)
          .lean()
          .cursor();
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${kind}.${format}"`,
  );
  const keys = columns[kind];
  const values = (item) =>
    kind === "vinyl"
      ? {
          ...item,
          area: multiply(item.length, item.width),
          inventoryValue: money(multiply(item.length, item.costPrice || 0)),
        }
      : item;
  if (format === "csv") {
    res.type("text/csv; charset=utf-8");
    res.write("\uFEFF" + keys.map((key) => headers[key]).join(",") + "\r\n");
    for await (const item of cursor) {
      if (res.destroyed) break;
      const row = values(item);
      const line =
        keys
          .map((key) => `"${safe(exportCell(row, key)).replaceAll('"', '""')}"`)
          .join(",") + "\r\n";
      if (!res.write(line))
        await new Promise((resolve) => {
          const done = () => {
            res.off("drain", done);
            res.off("close", done);
            resolve();
          };
          res.once("drain", done);
          res.once("close", done);
          if (res.destroyed) done();
        });
    }
    res.end();
  } else {
    res.type(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const sheet = workbook.addWorksheet(
      {
        sales: "فروشات",
        customers: "مشتریان",
        vinyl: "موجودی",
        payments: "پرداخت‌ها",
      }[kind],
      { views: [{ rightToLeft: true }] },
    );
    sheet.columns = keys.map((key) => ({
      header: headers[key],
      key,
      width: 24,
    }));
    for await (const item of cursor) {
      const row = values(item);
      sheet
        .addRow(
          Object.fromEntries(
            keys.map((key) => [
              key,
              typeof row[key] === "number"
                ? row[key]
                : safe(exportCell(row, key)),
            ]),
          ),
        )
        .commit();
    }
    await workbook.commit();
  }
}
