import { actorSchema } from "../services/actor.js";
import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    ...actorSchema,
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    address: { type: String, default: "" },
    img: { type: String, default: "" },
    balanceMinor: {
      type: Number,
      default: 0,
      min: -Number.MAX_SAFE_INTEGER,
      max: Number.MAX_SAFE_INTEGER,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);
schema.virtual("balance").get(function () {
  return this.balanceMinor / 100;
});
export default mongoose.model("Customer", schema);
