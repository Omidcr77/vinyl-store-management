import { formatDate } from "./calendar.js";
// Shared, escaped document markup for the preview, browser printing and PDF.
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(
    Number(n || 0),
  );
const amount = (n) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

export const billStyles = `
.bill-sheet,.bill-sheet *{box-sizing:border-box}
.bill-sheet{font-family:Vazirmatn,Arial,sans-serif;color:#182b29;background:#fff;direction:rtl;font-size:12px;line-height:1.8;width:100%;max-width:186mm;min-height:253mm;margin:0 auto;display:flex;flex-direction:column;text-align:right}
.bill-sheet h1,.bill-sheet h2,.bill-sheet h3,.bill-sheet p{margin:0;color:inherit;letter-spacing:0}
.bill-sheet p{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.bill-sheet bdi{unicode-bidi:isolate}
.bill-sheet .bill-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,0.7fr);gap:24px;padding:0 0 22px;margin:0;border-bottom:3px solid #244c40;align-items:start;break-inside:avoid}
.bill-sheet .bill-brand h1{font-size:25px;font-weight:600;line-height:1.65;margin-bottom:8px}
.bill-sheet .bill-kicker{font-size:10px;color:#687b74;margin-bottom:6px}
.bill-sheet .bill-title{font-size:27px;font-weight:600;line-height:1.3;margin-bottom:12px}
.bill-sheet .bill-meta{background:#f3f6f4;border:1px solid #dce5df;border-radius:4px;padding:14px}
.bill-sheet .bill-meta p{font-size:11px;margin:3px 0}
.bill-sheet .bill-number{display:block;font-size:14px;font-weight:600;direction:ltr;text-align:right;overflow-wrap:anywhere}
.bill-sheet .bill-parties{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:20px 0;margin:0;break-inside:avoid}
.bill-sheet .bill-label{font-size:10px;color:#64766e;display:block;margin-bottom:5px}
.bill-sheet .bill-customer{font-size:16px;font-weight:600;overflow-wrap:anywhere}
.bill-sheet .bill-status{align-self:start;border:1px solid #abc4b7;border-radius:4px;padding:5px 12px;font-size:11px;font-weight:600;background:#f2f7f3;color:#244c40}
.bill-sheet .bill-items{width:100%;min-width:0;table-layout:fixed;border-collapse:collapse;white-space:normal;font-size:12px;margin:0 0 20px;text-align:right}
.bill-sheet .bill-items th{background:#244c40;color:#fff;font-size:11px;font-weight:600;letter-spacing:0;padding:10px 8px;text-align:right;border:1px solid #244c40}
.bill-sheet .bill-items td{padding:15px 8px;vertical-align:top;border:1px solid #d9e2dd;color:#182b29;font-size:12px;overflow-wrap:anywhere;white-space:normal}
.bill-sheet .bill-items td strong{font-size:12px;color:#182b29}
.bill-sheet .bill-items small{display:block;color:#566b61;font-size:10px;margin-top:5px;line-height:1.7;overflow-wrap:anywhere}
.bill-sheet .bill-items tr{break-inside:avoid}
.bill-sheet .bill-items thead{display:table-header-group}
.bill-sheet .bill-bottom{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;margin-bottom:30px;align-items:start}
.bill-sheet .bill-note{border-inline-start:3px solid #d4e1d9;padding-inline-start:12px}
.bill-sheet .bill-note p{font-size:11px;color:#52675d}
.bill-sheet .bill-totals{border:1px solid #d9e2dd;break-inside:avoid}
.bill-sheet .bill-total-line{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid #e4ebe6;font-size:11px}
.bill-sheet .bill-total-line strong{font-weight:600;text-align:left;overflow-wrap:anywhere}
.bill-sheet .bill-total-line:last-child{border-bottom:0}
.bill-sheet .bill-total-line.grand{background:#f1f5f2;font-size:13px;font-weight:600}
.bill-sheet .bill-footer{margin-top:auto;break-inside:avoid;padding-top:24px}
.bill-sheet .bill-signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;padding:28px 8px 26px;text-align:center}
.bill-sheet .bill-signatures span{border-top:1px solid #7b9084;padding-top:9px;font-size:11px}
.bill-sheet .bill-thanks{border-top:2px solid #244c40;padding-top:15px;text-align:center;font-size:12px}
.bill-sheet .bill-issued{font-size:9px;color:#718279;text-align:center;margin-top:8px}
@media screen and (max-width:600px){.bill-sheet{font-size:11px;min-height:0}.bill-sheet .bill-head{grid-template-columns:1fr;gap:16px}.bill-sheet .bill-brand h1{font-size:21px}.bill-sheet .bill-title{font-size:22px}.bill-sheet .bill-bottom{grid-template-columns:1fr;gap:16px}.bill-sheet .bill-items th,.bill-sheet .bill-items td{padding:8px 4px;font-size:10px}.bill-sheet .bill-items td strong{font-size:11px}.bill-sheet .bill-parties{grid-template-columns:1fr}.bill-sheet .bill-signatures{gap:20px}}
@media print{.bill-sheet{max-width:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}.bill-sheet .bill-head{break-after:avoid}}
`;

export function renderStatement({
  customer,
  sales = [],
  payments = [],
  settings: s = {},
  summary,
  generatedAt = new Date(),
}) {
  const date = (value) => formatDate(value, s.calendar || "gregory");
  const currency = esc(s.currency || "USD");
  const money = (n) => `<bdi dir="ltr">${amount(n)} ${currency}</bdi>`;
  const totalLine = (label, value, grand = false) =>
    `<div class="bill-total-line${grand ? " grand" : ""}"><span>${label}</span><strong>${money(value)}</strong></div>`;
  const footer =
    s.invoiceFooter === "Thank you for choosing us."
      ? "از خرید شما سپاسگزاریم."
      : s.invoiceFooter || "از خرید شما سپاسگزاریم.";
  const saleRows = sales
    .map(
      (r) =>
        `<tr><td><bdi dir="ltr">${esc(r.billNumber)}</bdi><small>${esc(date(r.soldDate))}</small></td><td><strong>${esc(r.vinylName)}</strong><small>رول ${number(r.rollNumber)} · ${esc(r.type)} · ${esc(r.color)}</small><small><bdi dir="ltr">${number(r.soldLength)} × ${number(r.width)}</bdi> متر · ${number(r.area)} متر مربع</small></td><td>${money(r.totalAmount)}</td><td>${money(r.paidAmount)}${r.creditApplied > 0 ? `<small>از طلب مشتری: ${money(r.creditApplied)}</small>` : ""}</td><td>${money(r.remainingBalance)}</td></tr>`,
    )
    .join("");
  const paymentRows = payments
    .map(
      (r) =>
        `<tr><td><bdi dir="ltr">${esc(r.receiptNumber || `RCP-${r._id}`)}</bdi><small>${esc(date(r.date))}</small></td><td>${esc({ cash: "نقد", bank: "بانک", other: "سایر" }[r.paymentMethod] || r.paymentMethod)}<small>${esc(r.reference || "")}</small>${r.details ? `<small>${esc(r.details)}</small>` : ""}</td><td>${money(r.amount)}</td></tr>`,
    )
    .join("");
  return `<style>${billStyles}
  .bill-sheet.statement-sheet{display:block;min-height:0}
  .statement-sheet .bill-head{padding-bottom:10px;gap:18px}
  .statement-sheet .bill-title{font-size:23px;margin-bottom:8px}
  .statement-sheet .bill-meta{padding:10px}
  .statement-sheet .bill-parties{padding:10px 0}
  .statement-sheet .bill-parties p{font-size:11px;line-height:1.5}
  .bill-sheet .statement-heading{font-size:14px;margin:10px 0 6px;break-after:avoid}
  .bill-sheet .statement-note{font-size:10px;color:#52675d;margin:0 0 12px}
  .bill-sheet .statement-items th,.bill-sheet .statement-items td{padding:7px 5px;font-size:10px}
  .statement-sheet .bill-items small{margin-top:3px;line-height:1.5}
  .statement-sheet .bill-items{margin-bottom:12px}
  .bill-sheet .statement-items td strong{font-size:11px}
  .bill-sheet .statement-empty{padding:10px;background:#f6f8f6;margin-bottom:12px}
  .bill-sheet .statement-summary{margin-top:12px;margin-bottom:8px;break-inside:avoid}
  .statement-sheet .bill-total-line{padding:6px 10px}
  .statement-sheet .bill-footer{margin-top:0;padding-top:8px}
  .statement-sheet .bill-signatures{padding:16px 8px 10px}
  .statement-sheet .bill-thanks{padding-top:10px}
  @media print{.bill-sheet .statement-items{break-inside:auto}.bill-sheet .statement-items thead{display:table-header-group}}
  </style><article class="bill-sheet statement-sheet" lang="fa-AF" dir="rtl">
    <header class="bill-head"><div class="bill-brand"><h1>${esc(s.storeName || "فرش و قالین فروشی")}</h1>${s.storeAddress ? `<p>${esc(s.storeAddress)}</p>` : ""}${s.phone ? `<p>تماس: <bdi dir="ltr">${esc(s.phone)}</bdi></p>` : ""}</div><div><h2 class="bill-title">صورت‌حساب مشتری</h2><div class="bill-meta"><p>تاریخ تهیه: ${esc(date(generatedAt))}</p><p>دوره: تمام معاملات</p><p>واحد پول: <bdi dir="ltr">${currency}</bdi></p></div></div></header>
    <section class="bill-parties"><div><span class="bill-label">مشخصات مشتری</span><h3 class="bill-customer">${esc(customer.name)}</h3>${customer.phone ? `<p>تماس: <bdi dir="ltr">${esc(customer.phone)}</bdi></p>` : ""}${customer.address ? `<p>${esc(customer.address)}</p>` : ""}</div><span class="bill-status">${summary.balance < 0 ? "طلب مشتری" : summary.balance > 0 ? "دارای باقی‌داری" : "تصفیه‌شده"}</span></section>
    <h3 class="statement-heading">خریدها</h3>
    ${sales.length ? `<table class="bill-items statement-items"><colgroup><col style="width:21%"><col style="width:31%"><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup><thead><tr><th>بل / تاریخ</th><th>شرح جنس</th><th>مجموع</th><th>پرداخت هنگام فروش</th><th>باقی‌داری فعلی</th></tr></thead><tbody>${saleRows}</tbody></table>` : `<p class="statement-empty">هنوز خریدی ثبت نشده است.</p>`}
    <h3 class="statement-heading">رسیدهای پرداخت</h3><p class="statement-note">پرداخت‌های بعد از فروش؛ پرداخت هنگام فروش در جدول خریدها آمده است.</p>
    ${payments.length ? `<table class="bill-items statement-items"><colgroup><col style="width:32%"><col style="width:43%"><col style="width:25%"></colgroup><thead><tr><th>رسید / تاریخ</th><th>روش پرداخت / توضیحات</th><th>مبلغ</th></tr></thead><tbody>${paymentRows}</tbody></table>` : `<p class="statement-empty">پرداخت جداگانه‌ای ثبت نشده است.</p>`}
    <div class="bill-bottom statement-summary"><div class="bill-note"><span class="bill-label">خلاصهٔ حساب</span><p>این صورت‌حساب شامل تمام خریدها و پرداخت‌های ثبت‌شده تا تاریخ تهیه است.</p><p>مجموع پرداخت‌ها شامل پرداخت هنگام فروش و رسیدهای بعدی است.</p></div><div class="bill-totals">${totalLine("مجموع خریدها", summary.totalPurchases, true)}${totalLine("پرداخت هنگام فروش", summary.initialPaid)}${totalLine("پرداخت‌های بعدی", summary.receiptPaid)}${totalLine("مجموع پرداخت‌ها", summary.totalPayments)}${totalLine(summary.balance < 0 ? "طلب مشتری" : "باقی‌داری فعلی", Math.abs(summary.balance), true)}</div></div>
    <footer class="bill-footer"><div class="bill-signatures"><span>امضای مشتری</span><span>امضا و مهر فروشنده</span></div><p class="bill-thanks">${esc(footer)}</p><p class="bill-issued">صورت‌حساب تهیه‌شده در ${esc(date(generatedAt))}</p></footer>
  </article>`;
}

export function renderBill({
  record: r,
  settings: s = {},
  receipt = false,
  generatedAt = new Date(),
}) {
  const date = (value) => formatDate(value, s.calendar || "gregory");
  const currency = esc(r.currency || s.currency || "USD");
  const money = (n) => `<bdi dir="ltr">${amount(n)} ${currency}</bdi>`;
  const line = (label, value, strong = false) =>
    `<div class="bill-total-line${strong ? " grand" : ""}"><span>${label}</span><strong>${money(value)}</strong></div>`;
  const name =
    r.customerName?.toLowerCase() === "walk-in customer"
      ? "مشتری گذری"
      : r.customerName || "مشتری گذری";
  const footer =
    s.invoiceFooter === "Thank you for choosing us."
      ? "از خرید شما سپاسگزاریم."
      : s.invoiceFooter || "از خرید شما سپاسگزاریم.";
  const reference = receipt ? r.receiptNumber : r.billNumber;
  const unit = r.pricingMethod === "area" ? "متر مربع" : "متر طولی";
  const laterPaid = Math.max(
    0,
    Math.round(
      (r.totalAmount -
        r.paidAmount -
        (r.creditApplied || 0) -
        r.remainingBalance) *
        100,
    ) / 100,
  );
  const items = receipt
    ? `<colgroup><col style="width:60%"><col style="width:40%"></colgroup><thead><tr><th>پرداخت بابت بل</th><th>مبلغ (${currency})</th></tr></thead><tbody>${(r.allocations || []).map((a) => `<tr><td><bdi dir="ltr">${esc(a.billNumber || a.saleId)}</bdi></td><td>${money(a.amount)}</td></tr>`).join("")}${r.creditAmount > 0 ? `<tr><td>افزوده‌شده به طلب مشتری</td><td>${money(r.creditAmount)}</td></tr>` : ""}</tbody>`
    : `<colgroup><col style="width:42%"><col style="width:16%"><col style="width:21%"><col style="width:21%"></colgroup><thead><tr><th>شرح جنس</th><th>مقدار</th><th>نرخ واحد</th><th>مبلغ (${currency})</th></tr></thead><tbody><tr><td><strong>${esc(r.vinylName)}</strong><small>رول ${number(r.rollNumber)} · ${esc(r.type)} · ${esc(r.color)}</small><small>طول × عرض: <bdi dir="ltr">${number(r.soldLength)} × ${number(r.width)}</bdi> متر<br>مساحت: ${number(r.area)} متر مربع</small></td><td><bdi dir="ltr">${number(r.pricingMethod === "area" ? r.area : r.soldLength)}</bdi><small>${unit}</small></td><td>${money(r.pricePerMeter ?? r.pricePerSquareMeter)}<small>فی ${unit}</small></td><td><strong>${money(r.totalAmount)}</strong></td></tr></tbody>`;
  const totals = receipt
    ? line("مبلغ دریافت‌شده", r.amount, true) +
      (r.balanceBefore != null
        ? line(
            r.balanceBefore < 0
              ? "طلب مشتری قبل از رسید"
              : "باقی‌داری قبل از پرداخت",
            Math.abs(r.balanceBefore),
          ) +
          line(
            r.balanceAfter < 0
              ? "طلب مشتری پس از رسید"
              : "باقی‌داری پس از پرداخت",
            Math.abs(r.balanceAfter),
            true,
          )
        : "")
    : line("مبلغ مجموعی", r.totalAmount, true) +
      line("پرداخت هنگام فروش", r.paidAmount) +
      (r.creditApplied ? line("استفاده از طلب مشتری", r.creditApplied) : "") +
      line("پرداخت‌های بعدی", laterPaid) +
      line("باقی‌داری فعلی", r.remainingBalance, true);
  return `<style>${billStyles}</style><article class="bill-sheet" lang="fa-AF" dir="rtl">
    <header class="bill-head"><div class="bill-brand"><h1>${esc(s.storeName || "فرش و قالین فروشی")}</h1>${s.storeAddress ? `<p>${esc(s.storeAddress)}</p>` : ""}${s.phone ? `<p>تماس: <bdi dir="ltr">${esc(s.phone)}</bdi></p>` : ""}</div><div><h2 class="bill-title">${receipt ? "رسید پرداخت" : "بل فروش"}</h2><div class="bill-meta"><span class="bill-label">${receipt ? "شمارهٔ رسید" : "شمارهٔ بل"}</span><bdi class="bill-number">${esc(reference)}</bdi><p>تاریخ: ${esc(date(r.date || r.soldDate))}</p><p>واحد پول: <bdi dir="ltr">${currency}</bdi></p></div></div></header>
    <section class="bill-parties"><div><span class="bill-label">مشخصات مشتری</span><h3 class="bill-customer">${esc(name)}</h3>${r.customerPhone ? `<p>تماس: <bdi dir="ltr">${esc(r.customerPhone)}</bdi></p>` : ""}${r.customerAddress ? `<p>${esc(r.customerAddress)}</p>` : ""}</div><span class="bill-status">${receipt ? "دریافت شد" : r.remainingBalance > 0 ? "دارای باقی‌داری" : "تصفیه‌شده"}</span></section>
    <table class="bill-items">${items}</table>
    <div class="bill-bottom"><div class="bill-note"><span class="bill-label">${receipt ? "معلومات پرداخت" : "یادداشت"}</span>${receipt ? `<p>روش پرداخت: ${esc({ cash: "نقد", bank: "بانک", other: "سایر" }[r.paymentMethod] || r.paymentMethod)}</p><p>مرجع: ${esc(r.reference || "—")}</p>` : ""}<p>${esc((receipt ? r.details : r.notes) || "—")}</p></div><div class="bill-totals">${totals}</div></div>
    <footer class="bill-footer"><div class="bill-signatures"><span>امضای مشتری</span><span>امضا و مهر فروشنده</span></div><p class="bill-thanks">${esc(footer)}</p><p class="bill-issued">ثبت‌کننده: ${esc(r.createdByName || "رکورد قبلی")} · ${receipt ? "تاریخ تهیهٔ رسید" : "وضعیت پرداخت تا تاریخ"}: ${esc(date(generatedAt))}</p></footer>
  </article>`;
}
