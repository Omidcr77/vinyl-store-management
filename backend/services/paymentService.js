import { actorFields } from "./actor.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import { idempotent } from "./transaction.js";
import { required, AppError } from "../utils/errors.js";
import { minor } from "../utils/numbers.js";
import { lockSettings } from "./inventoryService.js";
import { receiptNumber } from "../utils/billNumber.js";
export async function createPayment(data, key) {
  return idempotent(Payment, key, data, async (session, requestHash, scopedKey) => {
    const settings = await lockSettings(session);
    const customer = required(
      await Customer.findById(data.customerId).session(session),
      "مشتری یافت نشد.",
    );
    const amountMinor = minor(data.amount);
    if (!Number.isSafeInteger(customer.balanceMinor - amountMinor))
      throw new AppError("موجودی حساب مشتری از حد مجاز بیشتر شده است.");
    const changed = await Customer.updateOne(
      { _id: customer._id, balanceMinor: customer.balanceMinor },
      { $inc: { balanceMinor: -amountMinor } },
      { session },
    );
    if (!changed.modifiedCount)
      throw new AppError(
        "باقی‌داری تغییر کرده است. صفحه را تازه کرده و دوباره کوشش کنید.",
        409,
      );
    let left = amountMinor;
    const allocations = [];
    const cursor = Sale.find({
      customerId: customer._id,
      remainingBalance: { $gt: 0 },
    })
      .sort({ soldDate: 1, _id: 1 })
      .session(session)
      .cursor();
    for await (const sale of cursor) {
      if (!left) break;
      const applied = Math.min(left, minor(sale.remainingBalance));
      sale.remainingBalance = (minor(sale.remainingBalance) - applied) / 100;
      await sale.save({ session });
      allocations.push({ saleId: sale._id, amount: applied / 100 });
      left -= applied;
    }
    const creditAmount = Math.max(
      0,
      amountMinor - Math.max(0, customer.balanceMinor),
    );
    if (left !== creditAmount)
      throw new AppError("حساب مشتری نیاز به بررسی دارد. پرداخت ثبت نشد.", 409);
    const [payment] = await Payment.create(
      [
        {
          ...data,
          allocations,
          creditAmount: creditAmount / 100,
          idempotencyKey: scopedKey,
          ...actorFields(true),
          requestHash,
          receiptNumber: await receiptNumber(session),
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          currency: settings.currency,
          balanceBefore: customer.balanceMinor / 100,
          balanceAfter: (customer.balanceMinor - amountMinor) / 100,
        },
      ],
      { session },
    );
    return payment;
  });
}
