import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, stat, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import sharp from "sharp";
import ExcelJS from "exceljs";
import { closePdfBrowser } from "../backend/services/documentService.js";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { connectDB } from "../backend/config/db.js";
import User from "../backend/models/User.js";
import {
  hashPassword,
  protectSockets,
} from "../backend/services/authService.js";
import { createApp } from "../backend/app.js";
process.env.TZ = "Asia/Kabul";
const testHost = process.env.UI_TEST_HOST || "127.0.0.1";
const apiPort = Number(process.env.UI_TEST_API_PORT || 5002);
const apiBase = `http://127.0.0.1:${apiPort}`;
process.env.CLIENT_URL = `http://${testHost}:5174`;
let db, server, io, vite, browser;
let uploadDir, authCookie, csrfToken;
let logs = "";
const errors = [];
let restoringBackup = false;
const base = process.env.CLIENT_URL;
async function api(path, body, method = "POST") {
  const response = await fetch(
    apiBase + "/api" + path,
    body
      ? {
          method,
          headers: {
            "Content-Type": "application/json",
            Cookie: authCookie,
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify(body),
        }
      : { headers: { Cookie: authCookie } },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error.message);
  return result.data;
}
try {
  uploadDir = await mkdtemp(resolve(tmpdir(), "vinyl-ui-images-"));
  process.env.UPLOAD_DIR = uploadDir;
  process.env.BACKUP_DIR = resolve(
    uploadDir,
    "../",
    `${uploadDir.split("/").pop()}-backups`,
  );
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(db.getUri("ui_tests"));
  const app = createApp();
  server = createServer(app);
  io = new Server(server, { cors: { origin: base } });
  app.set("io", io);
  protectSockets(io, [base]);
  await User.create({
    username: "uiadmin",
    name: "UI Admin",
    role: "admin",
    mustChangePassword: false,
    passwordHash: await hashPassword("UI-password-123"),
  });
  await new Promise((resolve) => server.listen(apiPort, "127.0.0.1", resolve));
  const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "store-app",
    },
    body: JSON.stringify({ username: "uiadmin", password: "UI-password-123" }),
  });
  authCookie = loginResponse.headers.get("set-cookie").split(";")[0];
  csrfToken = (await loginResponse.json()).data.csrf;
  vite = spawn(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      "--host",
      testHost,
      "--port",
      "5174",
      "--strictPort",
    ],
    {
      cwd: resolve("frontend"),
      env: { ...process.env, VITE_API_TARGET: apiBase },
      windowsHide: true,
      stdio: "pipe",
    },
  );
  vite.stdout.on("data", (d) => {
    logs += d;
  });
  vite.stderr.on("data", (d) => {
    logs += d;
  });
  vite.on("exit", (code, signal) => {
    if (code) console.error("Vite exited:", code, signal, logs.slice(-5000));
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (i === 119) throw new Error("Vite failed to start: " + logs);
    await new Promise((r) => setTimeout(r, 500));
  }
  await mkdir("test-results", { recursive: true });
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => console.error("Early page error:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("Browser console:", m.text());
  });
  page.on("requestfailed", (r) =>
    console.error("Failed request:", r.url(), r.failure()?.errorText),
  );
  await page.goto(base);
  await page.locator('input[name="username"]').waitFor();
  await page.screenshot({ path: "test-results/login-desktop.png" });
  await page.getByLabel("نام کاربری", { exact: true }).fill("uiadmin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("UI-password-123");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.locator(".sidebar").waitFor();
  console.log("PASS: authenticated Dari login");
  await page.goto(`${base}/users`);
  await page.getByRole("button", { name: "افزودن کاربر", exact: true }).click();
  await page.getByLabel("نام کامل", { exact: true }).fill("Browser Staff");
  await page.getByLabel("نام کاربری", { exact: true }).fill("browserstaff");
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill("Temporary-staff-123");
  await page.getByRole("button", { name: "ذخیرهٔ کاربر", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Browser Staff", { exact: true }).waitFor();
  const staffPage = await browser.newPage();
  staffPage.on("pageerror", (e) => errors.push(e.message));
  await staffPage.goto(base);
  await staffPage
    .getByLabel("نام کاربری", { exact: true })
    .fill("browserstaff");
  await staffPage
    .getByLabel("رمز عبور", { exact: true })
    .fill("Temporary-staff-123");
  await staffPage.getByRole("button", { name: "ورود", exact: true }).click();
  await staffPage
    .getByRole("heading", { name: "داشبورد", exact: true })
    .waitFor();
  for (const path of ["/users", "/settings", "/reports"])
    assert.equal(
      await staffPage.locator(`.sidebar a[href="${path}"]`).count(),
      0,
    );
  await staffPage.goto(`${base}/inventory`);
  await staffPage
    .getByRole("heading", { name: "موجودی فرش و قالین", exact: true })
    .waitFor();
  assert.equal(
    await staffPage
      .getByRole("button", { name: "افزودن رکورد", exact: true })
      .count(),
    0,
  );
  const staffRow = page.getByRole("row").filter({ hasText: "Browser Staff" });
  await staffRow.getByRole("button", { name: "ویرایش حساب" }).click();
  await page.getByLabel("وضعیت حساب", { exact: true }).selectOption("false");
  await page.getByRole("button", { name: "ذخیرهٔ کاربر", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await staffPage.getByRole("heading", { name: "ورود به حساب" }).waitFor();
  await staffPage.close();
  await page.goto(`${base}/audit`);
  await page.getByText("UI Admin", { exact: true }).first().waitFor();
  console.log(
    "PASS: admin user creation, direct login, staff permissions, audit and live deactivation",
  );
  await page.goto(`${base}/settings`);
  await page.locator('[name="sessionTimeoutMinutes"]').fill("60");
  await page
    .getByRole("button", { name: "ذخیرهٔ تنظیمات", exact: true })
    .click();
  await page.getByText("تنظیمات دکان ذخیره شد.", { exact: false }).waitFor();
  assert.equal((await api("/settings")).sessionTimeoutMinutes, 60);
  await page.reload();
  assert.equal(
    await page.locator('[name="sessionTimeoutMinutes"]').inputValue(),
    "60",
  );
  console.log("PASS: admin session duration setting saves and persists");
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !(
        restoringBackup &&
        (m.text().includes("401 (Unauthorized)") ||
          m.text().includes("503 (Service Unavailable)"))
      )
    )
      errors.push(m.text());
  });
  await page.goto(base);
  assert.equal(await page.locator("html").getAttribute("lang"), "fa-AF");
  assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
  assert.equal(await page.locator('.sidebar a[href="/sales/new"]').count(), 0);
  await page.getByRole("heading", { name: "فروشات اخیر" }).waitFor();
  await page.getByRole("link", { name: "مشتریان", exact: true }).click();
  await page.getByRole("button", { name: "افزودن مشتری", exact: true }).click();
  await page.getByLabel("نام مکمل").fill("Browser Customer");
  await page.getByLabel("شمارهٔ تماس", { exact: true }).fill("0701234567");
  await page.getByLabel("آدرس", { exact: true }).fill("Kabul");
  const photo = {
    name: "photo.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 120, height: 100, channels: 3, background: "#287465" },
    })
      .png()
      .toBuffer(),
  };
  await page.getByLabel("عکس (اختیاری)").setInputFiles(photo);
  await page.getByAltText("عکس انتخاب‌شده").waitFor();
  await page.getByRole("button", { name: "ذخیرهٔ مشتری" }).click();
  await page.getByText("Browser Customer", { exact: true }).waitFor();
  console.log("PASS: customer creation");
  const removable = await api("/customers", {
    name: "Delete browser customer",
    phone: "0701111111",
  });
  await page.goto(`${base}/customers/${removable._id}`);
  await page.getByRole("button", { name: "حذف مشتری", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "انصراف", exact: true })
    .click();
  assert.equal(
    (await api(`/customers/${removable._id}`)).customer.name,
    "Delete browser customer",
  );
  await page.getByRole("button", { name: "حذف مشتری", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "حذف مشتری", exact: true })
    .click();
  await page.waitForURL("**/customers");
  assert.ok(
    !(await api("/customers")).items.some((c) => c._id === removable._id),
  );
  console.log(
    "PASS: customer deletion confirmation, cancellation and list refresh",
  );
  assert.equal(
    await page.locator('.sidebar a[href="/inventory/new"]').count(),
    0,
  );
  await page.getByRole("link", { name: "موجودی", exact: true }).click();
  await page.getByRole("button", { name: "افزودن رکورد", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "انصراف", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.ok(page.url().endsWith("/inventory"));
  await page.getByRole("button", { name: "افزودن رکورد", exact: true }).click();
  await page.getByLabel("نام فرش و قالین").fill("Browser Oak");
  await page.getByLabel("نوع", { exact: false }).fill("Wood");
  await page.getByLabel("رنگ").fill("Brown");
  await page.getByLabel("طول (متر)").fill("30");
  await page.getByLabel("عرض (متر)").fill("4");
  await page.getByLabel("نرخ پیشنهادی فی متر طولی").fill("250");
  await page.getByLabel("عکس (اختیاری)").setInputFiles(photo);
  await page.getByAltText("عکس انتخاب‌شده").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "افزودن رکورد", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.waitForURL("**/inventory");
  await page.getByText("Browser Oak", { exact: true }).waitFor();
  let roll = (await api("/vinyl")).items[0];
  const customer = (await api("/customers")).items[0];
  assert.equal(roll.length, 30);
  assert.match(roll.img, /^\/api\/images\//);
  assert.match(customer.img, /^\/api\/images\//);
  await page.getByAltText("Browser Oak", { exact: true }).waitFor();
  assert.equal((await api("/settings")).currency, "USD");
  assert.equal((await api("/settings")).storeName, "فرش و قالین فروشی");
  console.log("PASS: inventory creation");
  await page.goto(`${base}/sales`);
  await page.getByRole("button", { name: "فروش جدید", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.ok(page.url().endsWith("/sales"));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "انصراف", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.ok(page.url().endsWith("/sales"));
  async function sell(length, price, paid) {
    await page.goto(
      `${base}/sales/new?vinylId=${roll._id}&customerId=${customer._id}`,
    );
    await page.getByRole("dialog").waitFor();
    await page.getByLabel("طول فروخته‌شده (متر)").fill(String(length));
    await page.getByLabel("نرخ مشتری فی متر طولی").fill(String(price));
    await page
      .getByLabel("مبلغ پرداخت‌شده", { exact: true })
      .fill(String(paid));
    await page.getByRole("button", { name: "تکمیل فروش" }).click();
    await page.waitForURL(/\/sales\/[a-f0-9]{24}$/);
    await page.getByRole("heading", { name: /^INV-/ }).waitFor();
  }
  await sell(8, 250, 2000);
  assert.equal((await api(`/vinyl/${roll._id}`)).length, 22);
  await sell(10, 250, 2500);
  assert.equal((await api(`/vinyl/${roll._id}`)).length, 12);
  await sell(5, 1000, 2000);
  assert.equal(
    (await api(`/customers/${customer._id}`)).customer.balance,
    3000,
  );
  console.log("PASS: partial sales, invoice and debt");
  await page.getByRole("button", { name: "چاپ بل", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  async function downloadPdf(filename) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: "دانلود PDF", exact: true }).click();
    const download = await event;
    assert.match(download.suggestedFilename(), /^(INV|RCP|statement)-.*\.pdf$/);
    await download.saveAs(`test-results/${filename}.pdf`);
    assert.equal(
      (await readFile(`test-results/${filename}.pdf`))
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );
  }
  await downloadPdf("downloaded-invoice");
  assert.equal(await page.locator(".bill-items").count(), 1);
  assert.equal(
    await page
      .locator(".bill-sheet")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  await page
    .locator(".bill-sheet")
    .screenshot({ path: "test-results/professional-invoice.png" });
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".print-document").isVisible(), true);
  assert.equal(await page.locator(".sidebar").isVisible(), false);
  await page.pdf({ path: "test-results/invoice.pdf", preferCSSPageSize: true });
  const mediaBox = (await readFile("test-results/invoice.pdf"))
    .toString("latin1")
    .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  assert.ok(mediaBox, "Printed PDF has a paper size");
  assert.ok(
    Math.abs(Number(mediaBox[1]) - 595.28) < 2 &&
      Math.abs(Number(mediaBox[2]) - 841.89) < 2,
    "Browser print uses A4 portrait",
  );
  assert.ok((await stat("test-results/invoice.pdf")).size > 1000);
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.getByRole("link", { name: "مشاهدهٔ حساب مشتری" }).click();
  await page.getByRole("button", { name: "ثبت رسید", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("مبلغ", { exact: true })
    .fill("1000");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ثبت رسید", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await api(`/customers/${customer._id}`)).customer.balance,
    2000,
  );
  await page
    .getByRole("button", { name: "چاپ رسید / PDF", exact: true })
    .click();
  await page.getByText("باقی‌داری پس از پرداخت", { exact: true }).waitFor();
  await downloadPdf("downloaded-receipt");
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".print-document").isVisible(), true);
  assert.equal(await page.locator(".sidebar").isVisible(), false);
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({
    path: "test-results/receipt-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.getByRole("button", { name: "ویرایش مشتری" }).click();
  await page.getByLabel("آدرس", { exact: true }).fill("Kabul, District 4");
  await page.getByRole("button", { name: "ذخیرهٔ مشتری" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    (await api(`/customers/${customer._id}`)).customer.img,
    customer.img,
  );
  await page.getByRole("button", { name: "چاپ صورت‌حساب" }).click();
  await page
    .getByRole("dialog")
    .getByText("رسیدهای پرداخت", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(".statement-sheet")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  await downloadPdf("downloaded-statement");
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  for (const displayHeaderFooter of [false, true]) {
    const printed = await page.pdf({
      preferCSSPageSize: true,
      displayHeaderFooter,
      path: `test-results/statement-print-${displayHeaderFooter}.pdf`,
    });
    assert.equal(
      (printed.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
      1,
      "A short customer statement, including signatures, must fit one A4 page",
    );
  }
  await page.emulateMedia({ media: "screen" });
  await page
    .locator(".statement-sheet")
    .screenshot({ path: "test-results/customer-statement.png" });
  await page.getByRole("button", { name: "بستن پنجره" }).click();
  console.log("PASS: payments, customer editing and statements");
  for (let i = 0; i < 16; i++)
    await api("/vinyl", {
      vinylName: `Filter Marble ${i}`,
      type: "Stone",
      color: "White",
      length: 3,
      width: 4,
    });
  await page.getByRole("link", { name: "موجودی", exact: true }).click();
  await page.getByLabel("جستجو", { exact: true }).fill("Filter Marble");
  await page.getByText("1–15 از 16", { exact: true }).waitFor();
  await page.getByRole("button", { name: "صفحهٔ بعدی" }).click();
  await page.getByText("16–16 از 16", { exact: true }).waitFor();
  await page.getByRole("button", { name: "فیلترها", exact: true }).click();
  await page.getByLabel("نوع", { exact: true }).fill("Stone");
  await page.getByLabel("وضعیت موجودی").selectOption("low-stock");
  await page.getByText("1–15 از 16", { exact: true }).waitFor();
  await page.getByLabel("جستجو", { exact: true }).fill("Filter Marble 0");
  await page.getByText("1–1 از 1", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^مشاهدهٔ رول/ }).click();
  await page.getByRole("dialog").getByRole("heading").waitFor();
  await page.getByRole("button", { name: "بستن پنجره" }).click();
  await page.getByRole("link", { name: /^ویرایش رول/ }).click();
  await page.waitForURL(/\/inventory\/[a-f0-9]{24}\/edit$/);
  await page
    .getByRole("textbox", { name: "نام فرش و قالین", exact: true })
    .fill("Edited Marble");
  await page.getByRole("button", { name: "ذخیرهٔ تغییرات" }).click();
  await page.waitForURL("**/inventory");
  await page.getByLabel("جستجو", { exact: true }).fill("Edited Marble");
  await page.getByText("1–1 از 1", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^بایگانی رول/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "بایگانی رول", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("0 مورد", { exact: true }).waitFor();
  console.log(
    "PASS: search, filters, pagination, view, edit and archive confirmation",
  );
  await page.getByRole("link", { name: "گزارش‌ها", exact: true }).click();
  await page.getByText("مجموع فروشات", { exact: true }).waitFor();
  assert.equal((await api("/reports/sales")).summary.totalSales, 9500);
  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const csv = await csvEvent;
  assert.equal(csv.suggestedFilename(), "sales.csv");
  const excelEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "اکسل", exact: true }).click();
  const excel = await excelEvent;
  assert.equal(excel.suggestedFilename(), "sales.xlsx");
  await page.getByRole("button", { name: "چاپ گزارش" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "بستن پنجره" }).click();
  await page.getByRole("button", { name: "گزارش موجودی" }).click();
  await page.getByText("ارزش خرید موجودی", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "باقی‌داری مشتریان", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Browser Customer", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "تنظیمات", exact: true }).click();
  await page.getByLabel("حد کمبود موجودی").fill("2");
  await page.getByRole("button", { name: "ذخیرهٔ تنظیمات" }).click();
  await page
    .getByRole("status")
    .getByText("تنظیمات دکان ذخیره شد.", { exact: false })
    .waitFor();
  console.log("PASS: reports, exports and settings");
  await page.goto(`${base}/customers/${customer._id}`);
  await page.getByRole("button", { name: "افزودن نرخ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("نوع فرش و قالین", { exact: true })
    .fill("Wood");
  await page
    .getByRole("dialog")
    .getByLabel("نرخ مشتری", { exact: true })
    .fill("180");
  await page.getByRole("button", { name: "ذخیرهٔ نرخ", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "ویرایش نرخ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("نرخ مشتری", { exact: true })
    .fill("175");
  await page.getByRole("button", { name: "ذخیرهٔ نرخ", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const secondCustomer = await api("/customers", {
    name: "مشتری دوم",
    phone: "0792222222",
  });
  await api(
    `/customers/${secondCustomer._id}/prices`,
    { type: "Wood", pricingMethod: "linear", unitPrice: 220 },
    "PUT",
  );
  await api(
    `/customers/${secondCustomer._id}/prices`,
    { type: "Wood", pricingMethod: "area", unitPrice: 70 },
    "PUT",
  );
  await page.goto(
    `${base}/sales/new?vinylId=${roll._id}&customerId=${customer._id}`,
  );
  const waitPrice = (label, value) =>
    page.waitForFunction(
      ({ label, value }) =>
        document.querySelector(`input[aria-label="${label}"]`)?.value === value,
      { label, value },
    );
  await waitPrice("نرخ مشتری فی متر طولی", "175");
  await page
    .locator(".lookup")
    .first()
    .getByRole("button", { name: "تغییر", exact: true })
    .click();
  await page.getByRole("button", { name: /مشتری دوم/ }).click();
  await waitPrice("نرخ مشتری فی متر طولی", "220");
  await page.getByLabel("روش قیمت‌گذاری").selectOption("area");
  await waitPrice("نرخ مشتری فی متر مربع", "70");
  await page.getByLabel("روش قیمت‌گذاری").selectOption("linear");
  await waitPrice("نرخ مشتری فی متر طولی", "220");
  await page.getByLabel("نرخ مشتری فی متر طولی").fill("199.99");
  await page.getByLabel("طول فروخته‌شده (متر)").fill("1");
  await page.getByLabel("مبلغ پرداخت‌شده", { exact: true }).fill("199.99");
  await page
    .getByRole("checkbox", {
      name: "ذخیرهٔ این نرخ برای این مشتری و این نوع فرش و قالین",
    })
    .check();
  await page.screenshot({
    path: "test-results/dari-customer-price.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "تکمیل فروش", exact: true }).click();
  await page.waitForURL(/\/sales\/[a-f0-9]{24}$/);
  const savedRates = await api(`/customers/${secondCustomer._id}/prices`);
  assert.equal(
    savedRates.items.find((r) => r.pricingMethod === "linear").unitPrice,
    199.99,
  );
  assert.equal(
    (await api(`/customers/${customer._id}/prices`)).items[0].unitPrice,
    175,
  );
  assert.equal((await api(`/vinyl/${roll._id}`)).sellingPrice, 250);
  const latestSale = await api("/sales/" + page.url().split("/").pop());
  assert.equal(latestSale.pricePerMeter, 199.99);
  assert.equal(latestSale.totalAmount, 199.99);
  await page.goto(
    `${base}/sales/new?vinylId=${roll._id}&customerId=${secondCustomer._id}`,
  );
  await waitPrice("نرخ مشتری فی متر طولی", "199.99");
  await page
    .locator(".lookup")
    .first()
    .getByRole("button", { name: "تغییر", exact: true })
    .click();
  await page.getByRole("button", { name: /مشتری گذری/ }).click();
  await waitPrice("نرخ مشتری فی متر طولی", "250");
  assert.equal(await page.getByRole("dialog").getByRole("checkbox").count(), 0);
  await page.getByLabel("روش قیمت‌گذاری").selectOption("area");
  await waitPrice("نرخ مشتری فی متر مربع", "");
  await page.goto(`${base}/customers/${customer._id}`);
  await page.getByRole("button", { name: "حذف نرخ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "انصراف", exact: true })
    .click();
  assert.equal((await api(`/customers/${customer._id}/prices`)).total, 1);
  await page.getByRole("button", { name: "حذف نرخ", exact: true }).click();
  await page
    .getByRole("button", { name: "تأیید حذف نرخ", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await api(`/customers/${customer._id}/prices`)).total, 0);
  console.log(
    "PASS: per-customer/type prices, unit switching, overrides, saved suggestions and deletion",
  );
  await page.goto(`${base}/inventory`);
  await page
    .getByRole("button", { name: "ثبت ورود اجناس", exact: true })
    .click();
  const deliveryDialog = page.getByRole("dialog");
  assert.equal(
    await deliveryDialog
      .getByLabel("تهیه‌کنندهٔ محموله", { exact: true })
      .isVisible(),
    false,
  );
  await deliveryDialog
    .getByText("تهیه‌کننده و تاریخ ورود (اختیاری)", { exact: true })
    .click();
  await deliveryDialog
    .getByLabel("تهیه‌کنندهٔ محموله", { exact: true })
    .fill("Truck supplier");
  await deliveryDialog
    .getByLabel("شمارهٔ مرجع محموله", { exact: true })
    .fill("TRUCK-UI");
  const deliveryRows = deliveryDialog.locator(".delivery-row");
  await deliveryRows
    .nth(0)
    .getByText("نام خاص، قیمت فروش و یادداشت (اختیاری)", { exact: true })
    .click();
  await deliveryRows
    .nth(0)
    .getByLabel("نام جنس", { exact: true })
    .fill("Truck Oak");
  await deliveryRows.nth(0).getByLabel("نوع", { exact: true }).fill("Wood");
  await deliveryRows.nth(0).getByLabel("رنگ", { exact: true }).fill("Brown");
  await deliveryRows
    .nth(0)
    .getByLabel("طول هر رول (متر)", { exact: true })
    .fill("30");
  await deliveryRows.nth(0).getByLabel("تعداد رول", { exact: true }).fill("20");
  await deliveryRows.nth(0).getByLabel("عکس (اختیاری)").setInputFiles(photo);
  await deliveryRows.nth(0).locator(".image-picker img").waitFor();
  const brownPhoto = await deliveryRows
    .nth(0)
    .locator(".image-picker img")
    .getAttribute("src");
  await deliveryRows
    .nth(0)
    .getByLabel("قیمت خرید فی متر (USD)", { exact: true })
    .fill("12.50");
  await deliveryRows
    .nth(0)
    .getByRole("button", {
      name: "همین جنس با رنگ یا اندازهٔ دیگر",
      exact: true,
    })
    .click();
  await deliveryRows.nth(1).getByLabel("رنگ", { exact: true }).fill("Blue");
  assert.equal(
    await deliveryRows.nth(1).locator(".image-picker img").getAttribute("src"),
    brownPhoto,
  );
  await deliveryRows
    .nth(1)
    .getByRole("button", { name: "حذف عکس", exact: true })
    .click();
  assert.equal(
    await deliveryRows.nth(1).locator(".image-picker img").count(),
    0,
  );
  assert.equal(
    await deliveryRows.nth(0).locator("img").getAttribute("src"),
    brownPhoto,
  );
  await deliveryRows.nth(1).getByLabel("عکس (اختیاری)").setInputFiles(photo);
  await deliveryRows.nth(1).locator(".image-picker img").waitFor();
  const bluePhoto = await deliveryRows
    .nth(1)
    .locator(".image-picker img")
    .getAttribute("src");
  assert.notEqual(bluePhoto, brownPhoto);
  await deliveryRows.nth(1).getByLabel("تعداد رول", { exact: true }).fill("10");
  await deliveryRows
    .nth(1)
    .getByRole("button", {
      name: "همین جنس با رنگ یا اندازهٔ دیگر",
      exact: true,
    })
    .click();
  await deliveryRows
    .nth(2)
    .getByRole("checkbox", { name: "طول رول‌ها یکسان نیست", exact: true })
    .check();
  await deliveryRows
    .nth(2)
    .getByLabel("لیست طول‌ها (متر)", { exact: true })
    .fill("30, 28, 25.5");
  const workbook = new ExcelJS.Workbook(),
    importSheet = workbook.addWorksheet("Delivery");
  importSheet.addRow([
    "vinylName",
    "type",
    "color",
    "length",
    "width",
    "quantity",
  ]);
  importSheet.addRow(["Truck Carpet", "Wool", "Red", 20, 3, 2]);
  await deliveryDialog.getByText("لیست Excel دارید؟", { exact: true }).click();
  await deliveryDialog
    .getByLabel("واردکردن فایل Excel", { exact: true })
    .setInputFiles({
      name: "truck.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
  await deliveryRows
    .nth(3)
    .getByText("نام خاص، قیمت فروش و یادداشت (اختیاری)", { exact: true })
    .click();
  await deliveryRows.nth(3).getByLabel("نام جنس", { exact: true }).waitFor();
  assert.equal(
    await deliveryRows
      .nth(3)
      .getByLabel("نام جنس", { exact: true })
      .inputValue(),
    "Truck Carpet",
  );
  assert.equal((await api("/vinyl?search=Truck")).total, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "test-results/delivery-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await deliveryDialog
    .getByRole("button", { name: "بررسی محموله", exact: true })
    .click();
  await deliveryDialog
    .getByRole("button", { name: "ثبت 35 رکورد", exact: true })
    .waitFor();
  await deliveryDialog
    .getByRole("button", { name: "برگشت به ویرایش", exact: true })
    .click();
  assert.equal(await deliveryRows.count(), 4);
  await deliveryDialog
    .getByRole("button", { name: "بررسی محموله", exact: true })
    .click();
  await page.screenshot({ path: "test-results/delivery-review.png" });
  await deliveryDialog
    .getByRole("button", { name: "ثبت 35 رکورد", exact: true })
    .click();
  await deliveryDialog.waitFor({ state: "hidden" });
  const truckRolls = await api("/vinyl?search=Truck&limit=100");
  assert.equal(truckRolls.total, 35);
  assert.ok(
    truckRolls.items
      .filter((r) => r.color === "Brown")
      .every((r) => r.img === brownPhoto),
  );
  assert.ok(
    truckRolls.items
      .filter((r) => r.color === "Blue")
      .every((r) => r.img === bluePhoto),
  );
  assert.ok(
    truckRolls.items.filter((r) => r.color === "Red").every((r) => !r.img),
  );
  assert.equal(new Set(truckRolls.items.map((r) => r.rollNumber)).size, 35);
  assert.ok(
    truckRolls.items.every(
      (r) =>
        r.deliveryReference === "TRUCK-UI" && r.supplier === "Truck supplier",
    ),
  );
  console.log(
    "PASS: delivery quantities, duplicate rows, mixed lengths, Excel review, atomic save and mobile layout",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/customers/${customer._id}`);
  const owing = (await api(`/customers/${customer._id}`)).customer.balance;
  await page.getByRole("button", { name: "ثبت رسید", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("مبلغ", { exact: true })
    .fill(String(owing + 50));
  await page
    .getByRole("dialog")
    .getByText("طلب مشتری پس از رسید", { exact: false })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ثبت رسید", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await api(`/customers/${customer._id}`)).customer.balance, -50);
  await page.getByText("طلب مشتری", { exact: true }).waitFor();
  await page.getByRole("button", { name: "چاپ رسید / PDF" }).first().click();
  await page.getByText("طلب مشتری پس از رسید", { exact: true }).waitFor();
  await downloadPdf("customer-credit-receipt");
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  // A creditor can give an additional advance even without any outstanding debt.
  await page.getByRole("button", { name: "ثبت رسید", exact: true }).click();
  await page.getByRole("dialog").getByLabel("مبلغ", { exact: true }).fill("10");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ثبت رسید", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await api(`/customers/${customer._id}`)).customer.balance, -60);
  console.log(
    "PASS: excess receipts, customer credit, advance receipts and printed credit balance",
  );
  await page.goto(`${base}/settings`);
  await page.getByLabel("تقویم", { exact: true }).selectOption("persian");
  await page
    .getByRole("button", { name: "ذخیرهٔ تنظیمات", exact: true })
    .click();
  await page.getByText("تنظیمات دکان ذخیره شد.", { exact: false }).waitFor();
  assert.equal((await api("/settings")).calendar, "persian");
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector('select[name="calendar"]')?.value === "persian",
  );
  await page.goto(`${base}/customers/${customer._id}`);
  await page.getByRole("button", { name: "ثبت رسید", exact: true }).click();
  const receiptDate = page.getByLabel("تاریخ رسید", { exact: true });
  await receiptDate.fill("1404/12/30");
  assert.equal(await receiptDate.evaluate((el) => el.checkValidity()), false);
  await receiptDate.fill("1405/07/06");
  assert.equal(await receiptDate.evaluate((el) => el.checkValidity()), true);
  await page
    .getByRole("button", { name: "انتخاب تاریخ شمسی", exact: true })
    .click();
  await page.getByRole("button", { name: "1405/07/06", exact: true }).click();
  await page.getByRole("dialog").getByLabel("مبلغ", { exact: true }).fill("1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ثبت رسید", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const calendarReceipts = await api(
    `/payments?customerId=${customer._id}&limit=100`,
  );
  assert.ok(
    calendarReceipts.items.some(
      (r) => r.amount === 1 && r.date.startsWith("2026-09-28"),
    ),
  );
  await page.getByRole("button", { name: "چاپ رسید / PDF" }).first().click();
  assert.ok((await page.locator(".bill-sheet").textContent()).includes("1405"));
  await downloadPdf("persian-calendar-receipt");
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  await page.goto(`${base}/settings`);
  await page.getByLabel("تقویم", { exact: true }).selectOption("gregory");
  await page
    .getByRole("button", { name: "ذخیرهٔ تنظیمات", exact: true })
    .click();
  await page.getByText("تنظیمات دکان ذخیره شد.", { exact: false }).waitFor();
  assert.equal((await api("/settings")).calendar, "gregory");
  console.log(
    "PASS: calendar settings persist, Persian date entry rejects invalid days, stores ISO and prints correctly",
  );
  const multiCustomer = await api("/customers", {
    name: "Multi Bill Customer",
    phone: "0705551234",
  });
  const multiRolls = [];
  for (const [name, length, width, color] of [
    ["Basket Red", 30, 4, "Red"],
    ["Basket Blue", 12, 3, "Blue"],
    ["Basket Green", 6, 2, "Green"],
  ])
    multiRolls.push(
      await api("/vinyl", {
        vinylName: name,
        type: name,
        color,
        length,
        width,
        sellingPrice: 20,
      }),
    );
  await page.goto(
    `${base}/sales/new?customerId=${multiCustomer._id}&vinylId=${multiRolls[0]._id}`,
  );
  await page.getByRole("dialog").waitFor();
  const item1 = page.getByRole("region", { name: "جنس 1", exact: true });
  await item1.getByLabel("طول فروخته‌شده (متر)").fill("5");
  await item1.getByLabel("نرخ مشتری فی متر طولی").fill("20");
  for (const [index, name] of [
    [2, "Basket Blue"],
    [3, "Basket Green"],
  ]) {
    await page
      .getByRole("button", { name: "افزودن جنس دیگر", exact: true })
      .click();
    const item = page.getByRole("region", {
      name: `جنس ${index}`,
      exact: true,
    });
    await item.getByRole("textbox", { name: "جستجو", exact: true }).fill(name);
    await item.getByRole("button", { name: new RegExp(name) }).click();
    if (index === 2) {
      await item.getByLabel("طول فروخته‌شده (متر)").fill("2");
      await item.getByLabel("روش قیمت‌گذاری").selectOption("area");
      await item.getByLabel("نرخ مشتری فی متر مربع").fill("10");
    } else {
      await item.getByRole("button", { name: "تمام رول", exact: true }).click();
      await item.getByLabel("نرخ مشتری فی متر طولی").fill("15");
      assert.equal(
        await item.getByLabel("طول فروخته‌شده (متر)").inputValue(),
        "6",
      );
    }
  }
  await page
    .getByRole("button", { name: "افزودن جنس دیگر", exact: true })
    .click();
  await page
    .getByRole("region", { name: "جنس 4", exact: true })
    .getByRole("button", { name: "حذف جنس", exact: true })
    .click();
  assert.equal(await page.locator(".sale-line").count(), 3);
  await page.getByLabel("مبلغ پرداخت‌شده", { exact: true }).fill("70");
  await page.screenshot({
    path: "test-results/multi-sale.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "تکمیل فروش", exact: true }).click();
  await page.waitForURL(/\/sales\/[a-f0-9]{24}$/);
  const multiSale = await api(`/sales/${page.url().split("/").at(-1)}`);
  assert.equal(multiSale.items.length, 3);
  assert.equal(multiSale.totalAmount, 250);
  assert.equal(multiSale.remainingBalance, 180);
  assert.equal((await api(`/sales?customerId=${multiCustomer._id}`)).total, 1);
  for (const [i, length] of [
    [0, 25],
    [1, 10],
    [2, 0],
  ])
    assert.equal((await api(`/vinyl/${multiRolls[i]._id}`)).length, length);
  await page.getByRole("button", { name: "چاپ بل", exact: true }).click();
  await page.locator(".bill-items").waitFor();
  assert.equal(await page.locator(".bill-items tbody tr").count(), 3);
  await downloadPdf("multi-item-invoice");
  await page.getByRole("button", { name: "بستن پنجره", exact: true }).click();
  console.log(
    "PASS: mixed-item basket, whole roll, remove item, one payment, stock deductions and one printable invoice",
  );
  for (const path of [
    "/",
    "/inventory",
    "/sales",
    "/customers",
    "/reports",
    "/settings",
    "/sales/new",
    "/inventory/new",
  ]) {
    console.log(`Checking mobile route: ${path}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + path);
    await page.locator("h1").waitFor();
    await page.waitForTimeout(150);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `Horizontal page overflow at ${path}`,
    );
    assert.equal(
      await page.getByRole("button", { name: "بازکردن فهرست" }).isVisible(),
      true,
    );
  }
  await page.goto(base);
  await page.getByRole("heading", { name: "فروشات اخیر" }).waitFor();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "بازکردن فهرست" }).click();
  await page.getByRole("link", { name: "موجودی", exact: true }).click();
  await page.waitForURL("**/inventory");
  assert.equal(await page.locator(".sidebar.open").count(), 0);
  console.log("PASS: responsive layouts and mobile navigation");
  assert.deepEqual(errors, [], "Browser console or runtime errors");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const bulkCustomerA = await api("/customers", {
    name: "Bulk UI A",
    phone: "0701111111",
  });
  const bulkCustomerB = await api("/customers", {
    name: "Bulk UI B",
    phone: "0702222222",
  });
  const bulkRollA = await api("/vinyl", {
    vinylName: "Bulk UI roll A",
    type: "Carpet",
    color: "Red",
    length: 20,
    width: 4,
  });
  const bulkRollB = await api("/vinyl", {
    vinylName: "Bulk UI roll B",
    type: "Carpet",
    color: "Blue",
    length: 20,
    width: 4,
  });
  const bulkSales = [];
  for (const roll of [bulkRollA, bulkRollB]) {
    const response = await fetch(apiBase + "/api/sales", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": `bulk-ui-${roll._id}`,
      },
      body: JSON.stringify({
        customerId: bulkCustomerA._id,
        vinylId: roll._id,
        soldLength: 2,
        pricingMethod: "linear",
        unitPrice: 10,
        paidAmount: 0,
      }),
    });
    assert.equal(response.status, 201);
    bulkSales.push((await response.json()).data);
  }
  for (const [route, search, labels] of [
    ["sales", "Bulk UI A", bulkSales.map((s) => s.billNumber)],
    [
      "inventory",
      "Bulk UI roll",
      [String(bulkRollA.rollNumber), String(bulkRollB.rollNumber)].map(
        (n) => `رول ${n}`,
      ),
    ],
    ["customers", "Bulk UI", ["Bulk UI A", "Bulk UI B"]],
  ]) {
    await page.goto(`${base}/${route}`);
    const kind = route === "inventory" ? "vinyl" : route;
    async function filterRows(value) {
      const loaded = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === `/api/${kind}` &&
          url.searchParams.get("search") === value &&
          response.status() === 200
        );
      });
      await page
        .getByRole("textbox", { name: "جستجو", exact: true })
        .fill(value);
      await loaded;
    }
    await filterRows(search);
    await page.getByRole("button", { name: "جدول (پیش‌فرض)", exact: true }).click();
    const rowDelete = page.getByRole("button", {
      name: `${route === "inventory" ? "بایگانی" : "حذف"} ${labels[0]}`,
      exact: true,
    });
    await rowDelete.waitFor();
    assert.equal(await rowDelete.evaluate((button) => {
      const cell = button.closest("td");
      const cells = [...cell.parentElement.children];
      return cells.every((other) =>
        cell.getBoundingClientRect().left <= other.getBoundingClientRect().left);
    }), true, `${route}: delete action must be in the leftmost column`);
    const deleteSelected = page.getByRole("button", {
      name: "حذف انتخاب‌شده‌ها",
      exact: true,
    });
    const choose = page.getByRole("button", {
      name: "انتخاب چند مورد",
      exact: true,
    });
    const selectAll = page.getByRole("checkbox", {
      name: "انتخاب همهٔ این صفحه",
      exact: true,
    });
    const rowChecks = labels.map((label) =>
      page.getByRole("checkbox", { name: `انتخاب ${label}`, exact: true }),
    );
    assert.equal(await deleteSelected.count(), 0);
    assert.equal(await rowChecks[0].count(), 0);
    await choose.click();
    for (const checkbox of rowChecks) await checkbox.waitFor();
    assert.equal(await deleteSelected.count(), 0);
    await rowChecks[0].check();
    await deleteSelected.waitFor();
    assert.equal(await selectAll.evaluate((node) => node.indeterminate), true);
    await page.getByRole("button", { name: "شبکه‌ای", exact: true }).click();
    assert.equal(await rowChecks[0].isChecked(), true);
    await rowChecks[1].check();
    assert.equal(await selectAll.isChecked(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    assert.equal(await rowDelete.evaluate((button) => {
      const actions = button.closest(".record-card-actions");
      const left = button.getBoundingClientRect().left;
      return Math.abs(left - actions.getBoundingClientRect().left) < 2;
    }), true, `${route}: delete button must align left in mobile cards`);
    await page.screenshot({
      path: `test-results/bulk-selection-${route}-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "جدول (پیش‌فرض)", exact: true })
      .click();
    for (const checkbox of rowChecks) await checkbox.uncheck();
    assert.equal(await deleteSelected.count(), 0);
    await rowChecks[0].check();
    await page.getByRole("button", { name: "لغو انتخاب", exact: true }).click();
    assert.equal(await rowChecks[0].count(), 0);
    assert.equal(await deleteSelected.count(), 0);
    // Select-all also enters selection mode directly.
    await selectAll.check();
    for (const checkbox of rowChecks)
      assert.equal(await checkbox.isChecked(), true);
    await filterRows("No matches for selection check");
    await choose.waitFor();
    assert.equal(await deleteSelected.count(), 0);
    assert.equal(await selectAll.isChecked(), false);
    await filterRows(search);
    await selectAll.check();
    await page
      .getByRole("button", { name: "حذف انتخاب‌شده‌ها", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "انصراف", exact: true })
      .click();
    assert.equal(await selectAll.isChecked(), true);
    await page
      .getByRole("button", { name: "حذف انتخاب‌شده‌ها", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "تأیید حذف", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    for (const label of labels)
      await page
        .getByRole("checkbox", { name: `انتخاب ${label}`, exact: true })
        .waitFor({ state: "hidden" });
  }
  assert.equal(
    (await api(`/customers/${bulkCustomerA._id}`)).customer.balance,
    0,
  );
  console.log(
    "PASS: selection mode, conditional delete, individual/select-all, cancel, filter reset, desktop/mobile views and bulk deletion on all three lists",
  );
  assert.deepEqual(
    errors,
    [],
    "Browser console or runtime errors after bulk deletion",
  );
  await page.goto(`${base}/settings`);
  await page.locator(".sidebar").waitFor();
  // A background session refresh during temporary maintenance must retain login.
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { message: "Maintenance" },
      }),
    }),
  );
  restoringBackup = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".sidebar").count(), 1);
  await page.unroute("**/api/auth/session");
  restoringBackup = false;
  const beforeBackup = await api("/settings");
  const downloadBackup = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "دانلود بکاپ کامل", exact: true })
    .click();
  const backupDownload = await downloadBackup;
  const backupPath = await backupDownload.path();
  assert.ok((await stat(backupPath)).size > 1000);
  await page
    .getByLabel("انتخاب فایل بکاپ", { exact: true })
    .setInputFiles(backupPath);
  await page
    .getByRole("button", { name: "بررسی فایل بکاپ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "بازیابی این بکاپ", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/backup-preview.png",
    fullPage: true,
  });
  await api(
    "/settings",
    { ...beforeBackup, storeName: "Changed after backup" },
    "PUT",
  );
  await page
    .getByRole("button", { name: "بازیابی این بکاپ", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "تأیید بازیابی کامل", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "انصراف", exact: true })
    .click();
  assert.equal((await api("/settings")).storeName, "Changed after backup");
  await page
    .getByRole("button", { name: "بازیابی این بکاپ", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  restoringBackup = true;
  await page
    .getByRole("button", { name: "تأیید بازیابی کامل", exact: true })
    .click();
  await page.waitForURL("**/login?restored=1");
  await page
    .getByText("بکاپ با موفقیت بازیابی شد.", { exact: false })
    .waitFor();
  await page.getByLabel("نام کاربری", { exact: true }).fill("uiadmin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("UI-password-123");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await page.locator(".sidebar").waitFor();
  restoringBackup = false;
  await page.goto(`${base}/settings`);
  assert.equal(
    await page.locator('input[name="storeName"]').inputValue(),
    beforeBackup.storeName,
  );
  await page
    .getByRole("button", { name: "نمایش بکاپ‌های پیش از بازیابی", exact: true })
    .click();
  await page
    .getByRole("button", { name: /دانلود بکاپ پیشین/ })
    .first()
    .waitFor();
  console.log(
    "PASS: full backup download, preview, cancel, restore, safety copy and restored admin login",
  );
  assert.deepEqual(errors, [], "Browser errors after backup restore");
  console.log("All browser workflows passed; no console errors.");
} catch (error) {
  console.error(error);
  console.error("Browser errors:", errors);
  console.error("Vite output:", logs.slice(-5000));
  for (const context of browser?.contexts() || [])
    for (const tab of context.pages()) {
      console.error("Failed page:", tab.url());
      console.error(
        (
          await tab
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(0, 1500),
      );
      await tab
        .screenshot({ path: "test-results/auth-failure.png", fullPage: true })
        .catch(() => {});
    }
  process.exitCode = 1;
} finally {
  await closePdfBrowser();
  await browser?.close();
  vite?.kill();
  io?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await db?.stop();
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  if (process.env.BACKUP_DIR)
    await rm(process.env.BACKUP_DIR, { recursive: true, force: true });
}
