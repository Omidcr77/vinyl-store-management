import { actorSchema } from "../services/actor.js";
import mongoose from "mongoose";
export default mongoose.model(
  "Delivery",
  new mongoose.Schema(
    {
      ...actorSchema,
      deliveryNumber: { type: String, required: true, unique: true },
      supplier: String,
      supplierId: {
        type: mongoose.Schema.Types.ObjectId,
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
