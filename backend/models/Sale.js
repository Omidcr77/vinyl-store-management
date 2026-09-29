import { actorSchema } from "../services/actor.js";
import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    ...actorSchema,
    billNumber: { type: String, required: true, unique: true },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },
    customerName: String,
    customerPhone: String,
    customerAddress: String,
    vinylId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VinylRoll",
      required: true,
      index: true,
    },
    rollNumber: { type: Number, index: true },
    vinylName: String,
    type: String,
    color: String,
    soldLength: Number,
    width: Number,
    area: Number,
    pricingMethod: { type: String, enum: ["linear", "area"] },
    pricePerMeter: Number,
    pricePerSquareMeter: Number,
    totalAmount: Number,
    paidAmount: Number,
    creditApplied: { type: Number, default: 0, min: 0 },
    remainingBalance: { type: Number, min: 0 },
    paymentType: { type: String, enum: ["cash", "credit", "partial"] },
    soldDate: { type: Date, default: Date.now, index: true },
    notes: String,
    currency: String,
    idempotencyKey: { type: String, required: true, unique: true },
    requestHash: String,
  },
  { timestamps: true },
);
schema.index({ customerId: 1, soldDate: 1 });
export default mongoose.model("Sale", schema);
