import { actorFields } from "./actor.js";
import Delivery from "../models/Delivery.js";
import Counter from "../models/Counter.js";
import VinylRoll from "../models/VinylRoll.js";
import { idempotent } from "./transaction.js";
import { lockSettings, stockStatus } from "./inventoryService.js";
import { nextSequence } from "../utils/billNumber.js";
export async function createDelivery(data, key) {
  return idempotent(Delivery, key, data, async (session, requestHash, scopedKey) => {
    const settings = await lockSettings(session);
    const expanded = data.rows.flatMap(
      ({ quantity, lengths, length, ...row }) =>
        (lengths || Array(quantity).fill(length)).map((value) => ({
          ...row,
          length: value,
        })),
    );
    const counter = await Counter.findByIdAndUpdate(
      "roll",
      { $inc: { value: expanded.length } },
      { new: true, upsert: true, session },
    );
    const first = counter.value - expanded.length + 1;
    const [delivery] = await Delivery.create(
      [
        {
          supplier: data.supplier,
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
        supplier: data.supplier,
        entryDate: data.entryDate,
        deliveryId: delivery._id,
        deliveryNumber: delivery.deliveryNumber,
        deliveryReference: data.reference,
        status: stockStatus(row.length, settings.lowStockThreshold),
      })),
      { session },
    );
    return delivery;
  });
}
