import { actorSchema } from "../services/actor.js";
import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    ...actorSchema,
    rollNumber: { type: Number, required: true, unique: true },
    vinylName: { type: String, required: true, trim: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    color: { type: String, required: true, trim: true, index: true },
    length: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 0.001 },
    entryDate: { type: Date, default: Date.now, index: true },
    details: { type: String, default: "" },
    status: {
      type: String,
      enum: ["available", "low-stock", "sold"],
      default: "available",
      index: true,
    },
    idempotencyKey: { type: String, unique: true, sparse: true },
    requestHash: String,
    originalLength: Number,
    importCost: { type: Number, min: 0 },
    purchaseTotal: Number,
    landedCostTotal: Number,
    landedCostPerMeter: Number,
    costCurrency: String,
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      index: true,
    },
    costPrice: { type: Number, min: 0 },
    sellingPrice: { type: Number, min: 0 },
    supplier: String,
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      index: true,
    },
    deliveryNumber: String,
    deliveryReference: String,
    img: { type: String, default: "" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export default mongoose.model("VinylRoll", schema);
