import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

// Exercise the actual frontend with explicit fixtures; never modify live records.
const base = process.env.MOBILE_TEST_URL || "http://127.0.0.1:5173";
const actor = {
  createdBy: "000000000000000000000001",
  createdByName: "فرید احمدی",
  createdByUsername: "farid.ahmadi",
  createdByRole: "staff",
  updatedBy: "000000000000000000000002",
  updatedByName: "جاوید نادری",
  updatedByUsername: "jawid.naderi",
  updatedByRole: "manager",
  createdAt: "2026-10-31T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};
const user = {
  _id: actor.createdBy,
  username: "mobile.test",
  name: "آزمایش موبایل",
  role: "admin",
  active: true,
  ...actor,
};
const roll = {
  _id: "000000000000000000000010",
  rollNumber: 26,
  vinylName: "قالین افغانی هرات با طرح گل‌دار",
  type: "قالین",
  color: "سرخ",
  length: 45,
  width: 4,
  area: 180,
  status: "available",
  costPrice: 10,
  sellingPrice: 15,
  ...actor,
};
const customer = {
  _id: "000000000000000000000020",
  name: "احمدشاه صافی",
  phone: "0701234567",
  address: "کابل، افغانستان",
  balance: 50,
  ...actor,
};
const event = {
  _id: "000000000000000000000030",
  actorName: actor.createdByName,
  actorUsername: actor.createdByUsername,
  actorRole: "staff",
  action: "POST /api/sales",
  target: roll._id,
  targetLabel: "INV-2026-000026",
  date: actor.createdAt,
  details: "ثبت فروش قالین",
  ...actor,
};
const settings = {
  storeName: "قالین فروشی پامیر",
  storeAddress: "کابل",
  phone: "0701234567",
  currency: "AFN",
  calendar: "persian",
  lowStockThreshold: 5,
  defaultVinylWidth: 4,
  invoiceFooter: "از خرید شما سپاسگزاریم.",
  sessionTimeoutMinutes: 480,
  ...actor,
};
const list = (item) => ({
  items: [item],
  total: 1,
  page: 1,
  pages: 1,
  limit: 15,
});
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data =
      path === "/api/auth/session"
        ? { user, csrf: "mobile-layout-fixture" }
        : path === "/api/settings"
          ? settings
          : path === "/api/audit"
            ? list(event)
            : path === "/api/users"
              ? list(user)
              : path === "/api/vinyl"
                ? list(roll)
                : path === "/api/customers"
                  ? list(customer)
                  : {};
    await route.fulfill({ json: { success: true, data } });
  });
  await context.route("**/socket.io/**", (route) =>
    route.fulfill({
      status: 400,
      json: { code: 0, message: "Layout fixture: sockets disabled" },
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/inventory", "/customers", "/users", "/audit"]) {
    await page.goto(base + path);
    await page.locator(".responsive-records tbody tr").first().waitFor();
    for (const width of [320, 360, 390, 430, 760, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${path} page overflow at ${width}`,
      );
      if (width <= 760) {
        const overflow = await page
          .locator(".responsive-records")
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.scrollWidth > node.clientWidth + 2)
              .map((node) => ({
                visible: node.clientWidth,
                content: node.scrollWidth,
              })),
          );
        assert.deepEqual(
          overflow,
          [],
          `${path} hides record fields at ${width}`,
        );
        const cells = await page
          .locator(".responsive-records tbody td")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => node.getBoundingClientRect())
              .every((r) => r.left >= 0 && r.right <= innerWidth),
          );
        assert.ok(cells, `${path} has off-screen cells at ${width}`);
        assert.equal(
          await page.getByRole("button", { name: "بازکردن فهرست" }).isVisible(),
          true,
        );
        await page.waitForFunction(
          () =>
            document.querySelector(".sidebar").getBoundingClientRect().left >=
            innerWidth - 1,
        );
        assert.equal(
          await page.locator(".mobile-cell-label").first().isVisible(),
          true,
        );
      } else {
        assert.equal(
          await page
            .locator(".responsive-records tbody tr")
            .first()
            .evaluate((el) => getComputedStyle(el).display),
          "table-row",
        );
        assert.equal(
          await page.locator(".mobile-cell-label").first().isVisible(),
          false,
        );
      }
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await page
      .locator(".responsive-records tbody tr")
      .first()
      .screenshot({ path: `test-results/mobile-layout-${path.slice(1)}.png` });
    if (path === "/audit") {
      await page.getByLabel("جستجوی کاربر یا رکورد").fill("farid");
      await page.getByLabel("نقش هنگام عملیات").selectOption("staff");
      await page.getByLabel("بخش", { exact: true }).selectOption("sales");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: "test-results/mobile-activity-layout.png",
        animations: "disabled",
        fullPage: true,
      });
    }
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await page.locator(".mobile-cell-label").first().isVisible(),
      false,
    );
    assert.equal(
      await page
        .locator(".responsive-records tbody tr")
        .first()
        .evaluate((el) => getComputedStyle(el).display),
      "table-row",
    );
    await page.emulateMedia({ media: "screen" });
    console.log(
      `PASS: ${path} content, controls and print layout at phone/tablet/desktop widths`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `Mobile layout checks passed against ${base} using representative fixtures.`,
  );
} finally {
  await browser.close();
}
