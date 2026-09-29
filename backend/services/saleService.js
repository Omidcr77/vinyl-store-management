import { actorFields } from "./actor.js";
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
import Decimal from "decimal.js";

export async function createSale(data, key) {
  return idempotent(
    Sale,
    key,
    data,
    async (session, requestHash, scopedKey) => {
      const settings = await lockSettings(session);
      const customer = data.customerId
        ? required(
            await Customer.findById(data.customerId).session(session),
            "مشتری یافت نشد.",
          )
        : null;
      const inputs = data.items || [data],
        items = [],
        remembered = new Map();
      let totalMinor = 0;
      for (const input of inputs) {
        const roll = required(
          await VinylRoll.findOne({
            _id: input.vinylId,
            archived: false,
          }).session(session),
          "رول فرش و قالین یافت نشد.",
        );
        if (input.soldLength > roll.length)
          throw new AppError(
            `فقط ${roll.length} متر در رول شمارهٔ ${roll.rollNumber} باقی مانده است.`,
            409,
          );
        if (input.rememberPrice && !customer)
          throw new AppError("برای ذخیرهٔ نرخ، نخست مشتری را انتخاب کنید.");
        const area = multiply(input.soldLength, roll.width);
        const totalAmount = money(
          multiply(
            input.pricingMethod === "area" ? area : input.soldLength,
            input.unitPrice,
          ),
        );
        if (totalAmount <= 0 || totalAmount > 100000000)
          throw new AppError("مبلغ هر جنس باید بین 0.01 و 100,000,000 باشد.");
        totalMinor += minor(totalAmount);
        if (totalMinor > 10000000000)
          throw new AppError("مجموع بل نمی‌تواند بیشتر از 100,000,000 باشد.");
        const length = quantity(subtract(roll.length, input.soldLength));
        const updated = await VinylRoll.updateOne(
          {
            _id: roll._id,
            length: { $gte: input.soldLength },
            archived: false,
          },
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
        items.push({
          vinylId: roll._id,
          rollNumber: roll.rollNumber,
          vinylName: roll.vinylName,
          type: roll.type,
          color: roll.color,
          soldLength: input.soldLength,
          width: roll.width,
          area,
          pricingMethod: input.pricingMethod,
          pricePerMeter:
            input.pricingMethod === "linear" ? input.unitPrice : undefined,
          pricePerSquareMeter:
            input.pricingMethod === "area" ? input.unitPrice : undefined,
          totalAmount,
        });
        if (input.rememberPrice) {
          const rateKey = JSON.stringify([roll.type, input.pricingMethod]);
          const previous = remembered.get(rateKey);
          if (previous && previous.unitPrice !== input.unitPrice)
            throw new AppError(
              "برای یک نوع جنس و روش قیمت‌گذاری، فقط یک نرخ را برای مشتری ذخیره کنید.",
            );
          remembered.set(rateKey, {
            type: roll.type,
            pricingMethod: input.pricingMethod,
            unitPrice: input.unitPrice,
          });
        }
      }
      const totalAmount = totalMinor / 100;
      if (data.paidAmount > totalAmount)
        throw new AppError(
          "مبلغ پرداخت‌شده نمی‌تواند بیشتر از مجموع فروش باشد.",
        );
      const unpaid = subtract(totalAmount, data.paidAmount);
      const creditApplied =
        Math.min(minor(unpaid), Math.max(0, -(customer?.balanceMinor || 0))) /
        100;
      const remainingBalance = subtract(unpaid, creditApplied);
      if (remainingBalance && !customer)
        throw new AppError(
          "برای فروش قرضی یا پرداخت قسمی، مشتری را انتخاب کنید.",
        );
      if (customer && unpaid) {
        if (!Number.isSafeInteger(customer.balanceMinor + minor(unpaid)))
          throw new AppError("باقی‌داری مشتری از حد مجاز بیشتر شده است.");
        await Customer.updateOne(
          { _id: customer._id },
          { $inc: { balanceMinor: minor(unpaid) } },
          { session },
        );
      }
      // Header totals keep reports/receipts invoice-based; item snapshots preserve
      // the individual prices and dimensions. Older single-item bills still work.
      const first = items[0],
        multi = items.length > 1;
      const sum = (field) =>
        items
          .reduce((n, item) => n.plus(item[field]), new Decimal(0))
          .toNumber();
      const [sale] = await Sale.create(
        [
          {
            ...first,
            items,
            vinylName: multi
              ? items.map((i) => i.vinylName).join("، ")
              : first.vinylName,
            type: multi
              ? [...new Set(items.map((i) => i.type))].join("، ")
              : first.type,
            color: multi
              ? [...new Set(items.map((i) => i.color))].join("، ")
              : first.color,
            rollNumber: multi ? undefined : first.rollNumber,
            soldLength: sum("soldLength"),
            area: sum("area"),
            width: multi ? undefined : first.width,
            pricingMethod: multi ? undefined : first.pricingMethod,
            pricePerMeter: multi ? undefined : first.pricePerMeter,
            pricePerSquareMeter: multi ? undefined : first.pricePerSquareMeter,
            customerId: customer?._id,
            customerName: customer?.name || "مشتری گذری",
            customerPhone: customer?.phone || "",
            customerAddress: customer?.address || "",
            soldDate: data.soldDate,
            notes: data.notes,
            paidAmount: data.paidAmount,
            billNumber: await billNumber(session),
            totalAmount,
            remainingBalance,
            creditApplied,
            paymentType:
              remainingBalance === 0
                ? "cash"
                : data.paidAmount === 0 && creditApplied === 0
                  ? "credit"
                  : "partial",
            currency: settings.currency,
            idempotencyKey: scopedKey,
            ...actorFields(true),
            requestHash,
          },
        ],
        { session },
      );
      for (const rate of remembered.values())
        await CustomerPrice.findOneAndUpdate(
          {
            customerId: customer._id,
            type: rate.type,
            pricingMethod: rate.pricingMethod,
          },
          {
            $set: { unitPrice: rate.unitPrice, ...actorFields() },
            $setOnInsert: {
              createdBy: actorFields(true).createdBy,
              createdByName: actorFields(true).createdByName,
            },
          },
          { upsert: true, new: true, runValidators: true, session },
        );
      return sale;
    },
  );
}
