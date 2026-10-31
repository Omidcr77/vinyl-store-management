export const roleLabels = {
  admin: "مدیر سیستم",
  manager: "مدیر",
  staff: "کارمند",
};
export const attributionKeys = [
  "createdBy",
  "createdByName",
  "createdByUsername",
  "createdByRole",
  "updatedBy",
  "updatedByName",
  "updatedByUsername",
  "updatedByRole",
];
export function actorText(record, prefix = "createdBy") {
  const name = record?.[prefix + "Name"] || record?.[prefix + "Username"];
  if (!name) return "رکورد قبلی — کاربر ثبت نشده";
  const role = roleLabels[record[prefix + "Role"]];
  return [
    name,
    role,
    record[prefix + "Username"] ? `@${record[prefix + "Username"]}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export const auditResources = {
  sales: { label: "فروشات", pattern: "(?:/api/sales(?:/|$)|^sale\\.)" },
  customers: {
    label: "مشتریان",
    pattern: "(?:/api/customers(?:/|$)|^customer\\.)",
  },
  vinyl: { label: "موجودی", pattern: "(?:/api/vinyl(?:/|$)|^inventory\\.)" },
  payments: { label: "رسیدها", pattern: "/api/payments(?:/|$)" },
  deliveries: { label: "محموله‌ها", pattern: "/api/deliveries(?:/|$)" },
  suppliers: { label: "تهیه‌کنندگان", pattern: "/api/suppliers(?:/|$)" },
  users: { label: "کاربران", pattern: "^user\\." },
  settings: { label: "تنظیمات", pattern: "/api/settings$" },
  auth: { label: "ورود و خروج", pattern: "^auth\\." },
  backups: { label: "بکاپ‌ها", pattern: "^backup\\." },
  images: {
    label: "عکس‌ها",
    pattern: "^(?:image\\.|inventory\\.photo_update)",
  },
  exports: {
    label: "دانلود و صادرات",
    pattern: "^(?:export\\.|document\\.|statement\\.)",
  },
};
const labels = {
  "auth.login": "ورود به حساب",
  "auth.logout": "خروج از حساب",
  "auth.password": "تغییر رمز عبور",
  "user.bootstrap": "ساخت مدیر نخست",
  "user.create": "ساخت کاربر",
  "user.update": "ویرایش حساب / نقش کاربر",
  "user.password_reset": "بازنشانی رمز عبور",
  "customer.delete": "حذف مشتری",
  "inventory.delete": "بایگانی رول",
  "inventory.photo_update": "تغییر عکس جنس",
  "sale.delete": "حذف فروش",
  "image.upload": "آپلود عکس",
  "backup.export": "دانلود بکاپ کامل",
  "backup.restore": "بازیابی بکاپ",
  "export.download": "دانلود گزارش",
  "document.download": "دانلود سند PDF",
  "statement.download": "دانلود صورت‌حساب",
};
export function auditActionLabel(action = "") {
  if (labels[action]) return labels[action];
  const [method, path = ""] = action.split(" ");
  if (path.endsWith("/bulk-delete")) return "حذف گروهی رکوردها";
  if (path.includes("/prices"))
    return method === "DELETE" ? "حذف نرخ مشتری" : "ثبت / تغییر نرخ مشتری";
  if (path.includes("/suppliers/") && path.endsWith("/reverse"))
    return "برگشت معاملهٔ تهیه‌کننده";
  if (path.includes("/suppliers/") && path.endsWith("/entries"))
    return "ثبت معاملهٔ تهیه‌کننده";
  const noun = path.startsWith("/api/customers")
    ? "مشتری"
    : path.startsWith("/api/vinyl")
      ? "رول"
      : path.startsWith("/api/suppliers")
        ? "تهیه‌کننده"
        : path.startsWith("/api/settings")
          ? "تنظیمات"
          : path.startsWith("/api/sales")
            ? "فروش"
            : path.startsWith("/api/payments")
              ? "رسید"
              : path.startsWith("/api/deliveries")
                ? "محموله"
                : "";
  return noun
    ? `${method === "DELETE" ? "حذف" : method === "PUT" ? "ویرایش" : "ثبت"} ${noun}`
    : action;
}
