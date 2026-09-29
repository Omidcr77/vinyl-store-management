import { actorSchema } from "../services/actor.js";
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    ...actorSchema,
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    type: { type: String, required: true, trim: true },
    pricingMethod: { type: String, enum: ["linear", "area"], required: true },
    unitPrice: { type: Number, required: true, min: 0.01, max: 100000000 },
  },
  { timestamps: true },
);
schema.index({ customerId: 1, type: 1, pricingMethod: 1 }, { unique: true });
export default mongoose.model("CustomerPrice", schema);
