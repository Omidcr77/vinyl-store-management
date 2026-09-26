import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Payment from "../models/Payment.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Settings from "../models/Settings.js";
import { required, AppError } from "../utils/errors.js";
import { id } from "../utils/validation.js";
const require = createRequire(import.meta.url);
let browserPromise;
let active = 0;
export async function closePdfBrowser() {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = undefined;
}
export async function receiptData(paymentId) {
  const payment = required(await Payment.findById(id.parse(paymentId)).lean());
  const [customer, sales] = await Promise.all([
    Customer.findById(payment.customerId).lean(),
    Sale.find({
      _id: { $in: payment.allocations.map((a) => a.saleId) },
    }).lean(),
  ]);
  return {
    ...payment,
    receiptNumber: payment.receiptNumber || `RCP-${payment._id}`,
    customerName: payment.customerName ?? customer?.name,
    customerPhone: payment.customerPhone ?? customer?.phone,
    customerAddress: payment.customerAddress ?? customer?.address,
    currency: payment.currency || sales[0]?.currency || "USD",
    allocations: payment.allocations.map((a) => ({
      ...a,
      billNumber:
        sales.find((s) => String(s._id) === String(a.saleId))?.billNumber ||
        String(a.saleId),
    })),
  };
}
const escape = (value) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (value) =>
  new Intl.NumberFormat("fa-AF", { maximumFractionDigits: 3 }).format(value);
const date = (value) =>
  new Intl.DateTimeFormat("fa-AF-u-ca-gregory", {
    dateStyle: "medium",
    timeZone: "Asia/Kabul",
  }).format(new Date(value));
export async function documentPdf(req, res) {
  const receipt = req.path.startsWith("/payments/");
  const record = receipt
    ? await receiptData(req.params.id)
    : required(await Sale.findById(id.parse(req.params.id)).lean());
  const settings = await Settings.findById("store").lean();
  if (settings.invoiceFooter === "Thank you for choosing us.")
    settings.invoiceFooter = "از خرید شما سپاسگزاریم.";
  if (record.customerName?.toLowerCase() === "walk-in customer")
    record.customerName = "مشتری گذری";
  if (active >= 3)
    throw new AppError("ساخت PDF مصروف است. چند لحظه بعد کوشش کنید.", 503);
  active++;
  let context;
  try {
    browserPromise ||= chromium.launch({ headless: true }).catch((error) => {
      browserPromise = undefined;
      throw error;
    });
    context = await (await browserPromise).newContext();
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const font = await readFile(
      require.resolve("@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2"),
    );
    const money = (n) =>
      `${number(n)} ${escape(record.currency || settings.currency)}`;
    const line = (label, value) =>
      `<tr><th>${escape(label)}</th><td>${value}</td></tr>`;
    const ref = receipt ? record.receiptNumber : record.billNumber;
    const title = `${receipt ? "رسید پرداخت" : "بل فروش"} ${escape(ref)}`;
    let rows = line("تاریخ", escape(date(record.date || record.soldDate)));
    if (receipt) {
      rows +=
        line("مبلغ پرداخت", money(record.amount)) +
        line(
          "روش پرداخت",
          escape(
            { cash: "نقد", bank: "بانک", other: "سایر" }[record.paymentMethod],
          ),
        ) +
        line("مرجع", escape(record.reference));
      if (record.balanceBefore != null)
        rows +=
          line("باقی‌داری قبل از پرداخت", money(record.balanceBefore)) +
          line("باقی‌داری پس از پرداخت", money(record.balanceAfter));
      rows += record.allocations
        .map((a) => line(`پرداخت بابت بل ${a.billNumber}`, money(a.amount)))
        .join("");
      rows += line("توضیحات", escape(record.details));
    } else {
      rows +=
        line(
          "جنس / شمارهٔ رول",
          `${escape(record.vinylName)} / ${number(record.rollNumber)}`,
        ) +
        line("نوع / رنگ", `${escape(record.type)} / ${escape(record.color)}`) +
        line(
          "طول × عرض",
          `${number(record.soldLength)} × ${number(record.width)} متر`,
        ) +
        line("مساحت", `${number(record.area)} متر مربع`) +
        line(
          "نرخ واحد",
          `${money(record.pricePerMeter ?? record.pricePerSquareMeter)} / ${record.pricingMethod === "area" ? "متر مربع" : "متر"}`,
        ) +
        line("مجموع", money(record.totalAmount)) +
        line("پرداخت هنگام فروش", money(record.paidAmount)) +
        line(
          "پرداخت‌های بعدی",
          money(
            record.totalAmount - record.paidAmount - record.remainingBalance,
          ),
        ) +
        line("باقی‌داری فعلی", money(record.remainingBalance)) +
        line("یادداشت‌ها", escape(record.notes));
    }
    await page.setContent(
      `<!doctype html><html lang="fa-AF" dir="rtl"><meta charset="utf-8"><style>@font-face{font-family:Vazir;src:url(data:font/woff2;base64,${font.toString("base64")})}body{font-family:Vazir,Arial;color:#172d31;font-size:13px;line-height:1.9}header{border-bottom:3px solid #217a68;padding-bottom:18px}h1{font-size:26px}h2{font-size:18px}table{width:100%;border-collapse:collapse;margin:22px 0}th,td{text-align:right;padding:10px;border-bottom:1px solid #dbe3df;overflow-wrap:anywhere}th{width:45%;background:#f3f7f5}tr{break-inside:avoid}footer{margin-top:30px;color:#60726c}p{white-space:pre-wrap;overflow-wrap:anywhere}</style><header><h1>${escape(settings.storeName)}</h1><p>${escape(settings.storeAddress)} · ${escape(settings.phone)}</p><h2>${title}</h2></header><h3>${escape(record.customerName === "Walk-in Customer" ? "مشتری نقدی" : record.customerName)}</h3><p>${escape(record.customerPhone)} · ${escape(record.customerAddress)}</p><table>${rows}</table><footer>${escape(settings.invoiceFooter)}<p>تاریخ تهیهٔ سند: ${escape(date(new Date()))}</p></footer></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" },
    });
    res.type("application/pdf").attachment(`${ref}.pdf`).send(buffer);
  } finally {
    try {
      await context?.close();
    } finally {
      active--;
    }
  }
}
