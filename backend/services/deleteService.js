import Decimal from "decimal.js";
import { z } from "zod";
import { id } from "../utils/validation.js";
import { required, AppError } from "../utils/errors.js";
import { minor, quantity } from "../utils/numbers.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import VinylRoll from "../models/VinylRoll.js";
import DeletedRecord from "../models/DeletedRecord.js";
import { transaction } from "./transaction.js";
import { lockSettings, stockStatus } from "./inventoryService.js";
import { actorFields, audit } from "./actor.js";
const selection = z.array(id).min(1).max(100);

export async function deleteRecords(kind, input) {
  const ids = [...new Set(selection.parse(input))].sort();
  return transaction(async (session) => {
    // All sales, payments and inventory changes take this same lock.
    const settings = await lockSettings(session);
    if (kind === "customers") {
      for (const customerId of ids) {
        const customer = required(
          await Customer.findById(customerId).session(session),
        );
        if (customer.archived) continue;
        customer.archived = true;
        Object.assign(customer, actorFields());
        await customer.save({ session });
        await audit("customer.delete", customerId, session, customer.name);
      }
    } else if (kind === "vinyl") {
      for (const rollId of ids) {
        const roll = required(
          await VinylRoll.findById(rollId).session(session),
        );
        if (roll.archived) continue;
        if (
          await Sale.exists({
            $or: [{ vinylId: rollId }, { "items.vinylId": rollId }],
          }).session(session)
        )
          throw new AppError(
            `رول شمارهٔ ${roll.rollNumber} سابقهٔ فروش دارد. نخست فروش مربوط را حذف کنید. هیچ رکوردی حذف نشد.`,
            409,
          );
        roll.archived = true;
        Object.assign(roll, actorFields());
        await roll.save({ session });
        await audit(
          "inventory.delete",
          rollId,
          session,
          String(roll.rollNumber),
        );
      }
    } else if (kind === "sales") {
      const customers = new Map();
      for (const saleId of ids) {
        const sale = await Sale.findById(saleId).session(session);
        if (!sale) {
          required(
            await DeletedRecord.exists({
              kind: "Sale",
              recordId: saleId,
            }).session(session),
          );
          continue; // Retrying a completed delete must not restore stock twice.
        }
        for (const item of sale.items?.length ? sale.items : [sale]) {
          const roll = required(
            await VinylRoll.findById(item.vinylId).session(session),
          );
          roll.length = quantity(
            new Decimal(roll.length).plus(item.soldLength),
          );
          roll.status = stockStatus(roll.length, settings.lowStockThreshold);
          Object.assign(roll, actorFields());
          await roll.save({ session });
        }
        if (sale.customerId) {
          const key = String(sale.customerId);
          const change = customers.get(key) || { unpaid: 0, released: 0 };
          const unpaid = minor(sale.totalAmount) - minor(sale.paidAmount);
          change.unpaid += unpaid;
          change.released += unpaid - minor(sale.remainingBalance);
          if (change.released < 0)
            throw new AppError("حساب فروش نیاز به بررسی دارد.", 409);
          customers.set(key, change);
        }
        await DeletedRecord.create(
          [
            {
              kind: "Sale",
              recordId: sale._id,
              idempotencyKey: sale.idempotencyKey,
              record: sale.toObject(),
            },
          ],
          { session },
        );
        await Sale.deleteOne({ _id: sale._id }).session(session);
        await audit("sale.delete", sale._id, session, sale.billNumber);
      }
      for (const [customerId, change] of customers) {
        const customer = required(
          await Customer.findById(customerId).session(session),
        );
        customer.balanceMinor -= change.unpaid;
        if (!Number.isSafeInteger(customer.balanceMinor))
          throw new AppError("موجودی حساب از حد مجاز بیشتر شده است.");
        Object.assign(customer, actorFields());
        await customer.save({ session });
        // Released prior payments/credit settle other open bills first. Any
        // remainder becomes customer credit. Original receipts stay unchanged.
        let available = change.released;
        const openSales = await Sale.find({
          customerId,
          remainingBalance: { $gt: 0 },
        })
          .sort({ soldDate: 1, _id: 1 })
          .session(session);
        for (const sale of openSales) {
          if (!available) break;
          const applied = Math.min(available, minor(sale.remainingBalance));
          sale.remainingBalance =
            (minor(sale.remainingBalance) - applied) / 100;
          sale.creditApplied = (minor(sale.creditApplied || 0) + applied) / 100;
          Object.assign(sale, actorFields());
          await sale.save({ session });
          available -= applied;
        }
      }
    } else throw new AppError("نوع رکورد معتبر نیست.");
    return { count: ids.length };
  });
}

export const bulkDelete = (kind) => async (req, res) => {
  const data = await deleteRecords(kind, req.body?.ids);
  req.app.get("io")?.emit("store:changed");
  res.json({ success: true, data });
};
export const singleDelete = (kind) => async (req, res) => {
  const data = await deleteRecords(kind, [req.params.id]);
  req.app.get("io")?.emit("store:changed");
  res.json({ success: true, data });
};
