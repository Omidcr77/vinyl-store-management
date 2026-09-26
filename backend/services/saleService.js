import VinylRoll from "../models/VinylRoll.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import CustomerPrice from "../models/CustomerPrice.js";
import { idempotent } from "./transaction.js";
import { lockSettings, stockStatus } from "./inventoryService.js";
import { billNumber } from "../utils/billNumber.js";
import { required, AppError } from "../utils/errors.js";
import {
  money,
  minor,
  multiply,
  subtract,
  quantity,
} from "../utils/numbers.js";
export async function createSale(data, key) {
  return idempotent(Sale, key, data, async (session, requestHash) => {
    const settings = await lockSettings(session);
    const roll = required(
      await VinylRoll.findOne({ _id: data.vinylId, archived: false }).session(
        session,
      ),
      "رول وینیل یافت نشد.",
    );
    if (data.soldLength > roll.length)
      throw new AppError(
        `فقط ${roll.length} متر در رول شمارهٔ ${roll.rollNumber} باقی مانده است.`,
        409,
      );
    const customer = data.customerId
      ? required(
          await Customer.findById(data.customerId).session(session),
          "مشتری یافت نشد.",
        )
      : null;
    const area = multiply(data.soldLength, roll.width);
    if (data.rememberPrice && !customer)
      throw new AppError("برای ذخیرهٔ نرخ، نخست مشتری را انتخاب کنید.");
    const totalAmount = money(
      multiply(
        data.pricingMethod === "area" ? area : data.soldLength,
        data.unitPrice,
      ),
    );
    if (totalAmount <= 0 || totalAmount > 100000000)
      throw new AppError("مبلغ فروش باید بین ۰٫۰۱ و ۱۰۰٬۰۰۰٬۰۰۰ باشد.");
    if (data.paidAmount > totalAmount)
      throw new AppError("مبلغ پرداخت‌شده نمی‌تواند بیشتر از مجموع فروش باشد.");
    const remainingBalance = subtract(totalAmount, data.paidAmount);
    if (remainingBalance && !customer)
      throw new AppError(
        "برای فروش قرضی یا پرداخت قسمی، مشتری را انتخاب کنید.",
      );
    const length = quantity(subtract(roll.length, data.soldLength));
    const updated = await VinylRoll.updateOne(
      { _id: roll._id, length: { $gte: data.soldLength }, archived: false },
      {
        $set: {
          length,
          status: stockStatus(length, settings.lowStockThreshold),
        },
      },
      { session },
    );
    if (!updated.modifiedCount)
      throw new AppError("موجودی تغییر کرده است. دوباره کوشش کنید.", 409);
    if (customer && remainingBalance) {
      if (
        !Number.isSafeInteger(customer.balanceMinor + minor(remainingBalance))
      )
        throw new AppError("باقی‌داری مشتری از حد مجاز بیشتر شده است.");
      await Customer.updateOne(
        { _id: customer._id },
        { $inc: { balanceMinor: minor(remainingBalance) } },
        { session },
      );
    }
    const [sale] = await Sale.create(
      [
        {
          ...data,
          billNumber: await billNumber(session),
          customerName: customer?.name || "مشتری گذری",
          customerPhone: customer?.phone || "",
          customerAddress: customer?.address || "",
          rollNumber: roll.rollNumber,
          vinylName: roll.vinylName,
          type: roll.type,
          color: roll.color,
          width: roll.width,
          area,
          pricePerMeter:
            data.pricingMethod === "linear" ? data.unitPrice : undefined,
          pricePerSquareMeter:
            data.pricingMethod === "area" ? data.unitPrice : undefined,
          totalAmount,
          remainingBalance,
          paymentType:
            remainingBalance === 0
              ? "cash"
              : data.paidAmount === 0
                ? "credit"
                : "partial",
          currency: settings.currency,
          idempotencyKey: key,
          requestHash,
        },
      ],
      { session },
    );
    if (data.rememberPrice) {
      await CustomerPrice.findOneAndUpdate(
        {
          customerId: customer._id,
          type: roll.type,
          pricingMethod: data.pricingMethod,
        },
        { $set: { unitPrice: data.unitPrice } },
        { upsert: true, new: true, runValidators: true, session },
      );
    }
    return sale;
  });
}
