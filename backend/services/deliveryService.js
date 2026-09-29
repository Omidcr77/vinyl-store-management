import { purchaseFields, purchaseAccount } from "./purchaseService.js";
import Supplier from "../models/Supplier.js";
import { required, AppError } from "../utils/errors.js";
import { minor } from "../utils/numbers.js";
import { actorFields } from "./actor.js";
import Delivery from "../models/Delivery.js";
import Counter from "../models/Counter.js";
import VinylRoll from "../models/VinylRoll.js";
import { idempotent } from "./transaction.js";
import { lockSettings, stockStatus } from "./inventoryService.js";
import { nextSequence } from "../utils/billNumber.js";
export async function createDelivery(data, key) {
  return idempotent(
    Delivery,
    key,
    data,
    async (session, requestHash, scopedKey) => {
      const settings = await lockSettings(session);
      const supplier = data.supplierId
        ? required(await Supplier.findById(data.supplierId).session(session))
        : null;
      const expanded = data.rows.flatMap(
        ({ quantity, lengths, length, ...row }) =>
          (lengths || Array(quantity).fill(length)).map((value) => ({
            ...row,
            length: value,
            ...purchaseFields(
              { ...row, length: value, supplierId: data.supplierId },
              settings.currency,
            ),
          })),
      );
      const purchaseTotal =
        expanded.reduce((sum, row) => sum + minor(row.purchaseTotal || 0), 0) /
        100;
      const importCost =
        expanded.reduce((sum, row) => sum + minor(row.importCost || 0), 0) /
        100;
      if (purchaseTotal > 100000000)
        throw new AppError("مبلغ محموله از حد مجاز بیشتر است.");
      const counter = await Counter.findByIdAndUpdate(
        "roll",
        { $inc: { value: expanded.length } },
        { new: true, upsert: true, session },
      );
      const first = counter.value - expanded.length + 1;
      const [delivery] = await Delivery.create(
        [
          {
            supplier: supplier?.name || data.supplier,
            supplierId: data.supplierId,
            purchaseTotal,
            importCost,
            paidAmount: data.paidAmount,
            currency: settings.currency,
            reference: data.reference,
            entryDate: data.entryDate,
            deliveryNumber: `DEL-${String(await nextSequence("delivery", session)).padStart(6, "0")}`,
            rollCount: expanded.length,
            firstRollNumber: first,
            lastRollNumber: counter.value,
            idempotencyKey: scopedKey,
            ...actorFields(true),
            requestHash,
          },
        ],
        { session },
      );
      await VinylRoll.insertMany(
        expanded.map((row, i) => ({
          ...row,
          ...actorFields(true),
          rollNumber: first + i,
          supplier: supplier?.name || data.supplier,
          supplierId: data.supplierId,
          entryDate: data.entryDate,
          deliveryId: delivery._id,
          deliveryNumber: delivery.deliveryNumber,
          deliveryReference: data.reference,
          status: stockStatus(row.length, settings.lowStockThreshold),
        })),
        { session },
      );
      await purchaseAccount(
        {
          supplierId: data.supplierId,
          amount: purchaseTotal,
          paidAmount: data.paidAmount,
          currency: settings.currency,
          date: data.entryDate,
          reference: data.reference || delivery.deliveryNumber,
          deliveryId: delivery._id,
        },
        session,
      );
      return delivery;
    },
  );
}
