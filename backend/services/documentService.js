import { renderBill } from "../../shared/bill.js";
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
  return sendDocumentPdf(
    res,
    renderBill({ record, settings, receipt }),
    receipt ? record.receiptNumber : record.billNumber,
  );
}
export async function sendDocumentPdf(res, markup, ref) {
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
    const [font, boldFont] = await Promise.all([
      readFile(
        require.resolve("@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2"),
      ),
      readFile(
        require.resolve("@fontsource/vazirmatn/files/vazirmatn-arabic-600-normal.woff2"),
      ),
    ]);
    await page.setContent(
      `<!doctype html><html lang="fa-AF" dir="rtl"><head><meta charset="utf-8"><style>@font-face{font-family:Vazirmatn;font-weight:400;src:url(data:font/woff2;base64,${font.toString("base64")})}@font-face{font-family:Vazirmatn;font-weight:600;src:url(data:font/woff2;base64,${boldFont.toString("base64")})}body{margin:0}</style></head><body>${markup}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
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
