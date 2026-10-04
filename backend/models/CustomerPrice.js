import { actorSchema } from "../services/actor.js";
import database from "../db/mysql.js";

const schema = new database.Schema(
  {
    ...actorSchema,
    customerId: {
      type: database.Schema.Types.ObjectId,
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
export default database.model("CustomerPrice", schema);
