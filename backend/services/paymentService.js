import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import { idempotent } from "./transaction.js";
import { required, AppError } from "../utils/errors.js";
import { minor } from "../utils/numbers.js";
import Settings from "../models/Settings.js";
import { receiptNumber } from "../utils/billNumber.js";
export async function createPayment(data, key) {
  return idempotent(Payment, key, data, async (session, requestHash) => {
    const customer = required(
      await Customer.findById(data.customerId).session(session),
      "مشتری یافت نشد.",
    );
    const amountMinor = minor(data.amount);
    if (amountMinor > customer.balanceMinor)
      throw new AppError(
        `مبلغ پرداخت بیشتر از باقی‌داری ${customer.balanceMinor / 100} است.`,
      );
    const changed = await Customer.updateOne(
      { _id: customer._id, balanceMinor: { $gte: amountMinor } },
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
    if (left)
      throw new AppError("حساب مشتری نیاز به بررسی دارد. پرداخت ثبت نشد.", 409);
    const [payment] = await Payment.create(
      [
        {
          ...data,
          allocations,
          idempotencyKey: key,
          requestHash,
          receiptNumber: await receiptNumber(session),
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          currency: (await Settings.findById("store").session(session))
            .currency,
          balanceBefore: customer.balanceMinor / 100,
          balanceAfter: (customer.balanceMinor - amountMinor) / 100,
        },
      ],
      { session },
    );
    return payment;
  });
}
