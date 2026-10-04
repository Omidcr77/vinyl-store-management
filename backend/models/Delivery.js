import { actorSchema } from "../services/actor.js";
import database from "../db/mysql.js";
export default database.model(
  "Delivery",
  new database.Schema(
    {
      ...actorSchema,
      deliveryNumber: { type: String, required: true, unique: true },
      supplier: String,
      supplierId: {
        type: database.Schema.Types.ObjectId,
        ref: "Supplier",
        index: true,
      },
      purchaseTotal: Number,
      importCost: Number,
      paidAmount: Number,
      currency: String,
      reference: String,
      entryDate: Date,
      rollCount: Number,
      firstRollNumber: Number,
      lastRollNumber: Number,
      idempotencyKey: { type: String, required: true, unique: true },
      requestHash: String,
    },
    { timestamps: true },
  ),
);
