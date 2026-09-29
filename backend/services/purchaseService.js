import Decimal from "decimal.js";
import Supplier from "../models/Supplier.js";
import { postSupplierEntry } from "./supplierService.js";
import { required, AppError } from "../utils/errors.js";
import { money, minor } from "../utils/numbers.js";
export function purchaseFields(data, currency) {
  const originalLength = data.originalLength ?? data.length;
  const importCost = data.importCost ?? 0;
  if (data.costPrice == null) {
    if (importCost || data.supplierId)
      throw new AppError(
        "برای هزینهٔ ورود یا حساب تهیه‌کننده، قیمت خرید را وارد کنید.",
      );
    return { originalLength, importCost, costCurrency: currency };
  }
  const purchaseTotal = money(
    new Decimal(originalLength).times(data.costPrice).toNumber(),
  );
  const landedCostTotal = money(purchaseTotal + importCost);
  if (landedCostTotal > 100000000)
    throw new AppError("قیمت مجموعی هر رول از حد مجاز بیشتر است.");
  return {
    originalLength,
    importCost,
    purchaseTotal,
    landedCostTotal,
    landedCostPerMeter: new Decimal(landedCostTotal)
      .div(originalLength)
      .toNumber(),
    costCurrency: currency,
  };
}
export async function purchaseAccount(
  {
    supplierId,
    amount,
    paidAmount = 0,
    currency,
    date,
    reference,
    deliveryId,
    vinylId,
  },
  session,
) {
  if (!supplierId) {
    if (paidAmount)
      throw new AppError("برای ثبت پرداخت، حساب تهیه‌کننده را انتخاب کنید.");
    return;
  }
  required(
    await Supplier.findById(supplierId).session(session),
    "تهیه‌کننده یافت نشد.",
  );
  const common = { supplierId, currency, date, reference, deliveryId, vinylId };
  if (amount > 0)
    await postSupplierEntry(
      {
        ...common,
        kind: "purchase",
        amount,
        deltaMinor: minor(amount),
        details: "خرید اجناس؛ هزینهٔ حمل جدا از حساب تهیه‌کننده است.",
      },
      session,
    );
  if (paidAmount > 0)
    await postSupplierEntry(
      {
        ...common,
        kind: "payment",
        amount: paidAmount,
        deltaMinor: -minor(paidAmount),
        details: "پرداخت هنگام ورود اجناس",
      },
      session,
    );
}
