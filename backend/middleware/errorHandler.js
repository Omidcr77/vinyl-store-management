import { ZodError } from "zod";
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || 500,
    message = error.message;
  if (error instanceof ZodError) {
    status = 400;
    const names = {
      vinylName: "نام فرش و قالین",
      type: "نوع",
      color: "رنگ",
      length: "طول",
      width: "عرض",
      name: "نام",
      phone: "شمارهٔ تماس",
      address: "آدرس",
      unitPrice: "نرخ مشتری",
      soldLength: "طول فروش",
      paidAmount: "مبلغ پرداخت‌شده",
      amount: "مبلغ",
      pricingMethod: "روش قیمت‌گذاری",
      paymentMethod: "روش پرداخت",
      customerId: "مشتری",
      vinylId: "رول",
      date: "تاریخ",
      soldDate: "تاریخ فروش",
      entryDate: "تاریخ ورود",
      currency: "واحد پول",
      lowStockThreshold: "حد کمبود موجودی",
      defaultVinylWidth: "عرض پیش‌فرض",
      costPrice: "قیمت خرید",
      sellingPrice: "نرخ پیشنهادی",
      storeName: "نام دکان",
      img: "آدرس تصویر",
      rememberPrice: "ذخیرهٔ نرخ",
      quantity: "تعداد",
      lengths: "لیست طول‌ها",
      rows: "ردیف‌ها",
      reference: "مرجع",
      supplier: "تهیه‌کننده",
    };
    message = error.issues
      .map((issue) => {
        const field = issue.path.at(-1);
        const label =
          issue.path[0] === "rows" && typeof issue.path[1] === "number"
            ? `ردیف ${issue.path[1] + 1}، ${names[field] || "معلومات"}`
            : names[field] || "معلومات واردشده";
        if (/[\u0600-\u06ff]/.test(issue.message))
          return `${label}: ${issue.message}`;
        const detail =
          issue.code === "too_small"
            ? `مقدار نباید کمتر از ${issue.minimum} باشد یا خالی بماند.`
            : issue.code === "too_big"
              ? `مقدار نباید بیشتر از ${issue.maximum} باشد.`
              : issue.code === "not_multiple_of"
                ? `دقت عدد باید مضرب ${issue.divisor} باشد.`
                : issue.code === "invalid_type"
                  ? "مقدار ضروری است و باید از نوع درست باشد."
                  : "مقدار معتبر وارد کنید.";
        return `${label}: ${detail}`;
      })
      .join(" ");
  } else if (error.name === "MulterError") {
    status = 400;
    message =
      error.code === "LIMIT_FILE_SIZE"
        ? "حجم عکس نباید بیشتر از 5 مگابایت باشد."
        : "تنها یک عکس را با خانهٔ «image» ارسال کنید.";
  } else if (error.name === "CastError") {
    status = 400;
    message = "شناسه یا مقدار واردشده معتبر نیست.";
  } else if (error.name === "ValidationError") {
    status = 400;
    message = "خانه‌های ضروری و مقدارهای عددی را بررسی کنید.";
  } else if (error.code === 11000) {
    status = 409;
    message = "موردی با این شماره قبلاً ثبت شده است. دوباره کوشش کنید.";
  } else if (status >= 500) {
    console.error(error);
    message = "درخواست تکمیل نشد. دوباره کوشش کنید.";
  }
  res.status(status).json({ success: false, error: { message } });
}
