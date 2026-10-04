import database from "../db/mysql.js";
import { actorSchema } from "../services/actor.js";
const schema = new database.Schema(
  {
    ...actorSchema,
    customerId: {
      type: database.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    type: { type: String, required: true },
    color: String,
    width: Number,
    pricingMethod: { type: String, enum: ["linear", "area"], required: true },
    unitPrice: { type: Number, required: true },
    currency: String,
    source: {
      type: String,
      enum: ["sale", "saved", "removed", "previous"],
      required: true,
    },
    saleId: { type: database.Schema.Types.ObjectId, ref: "Sale" },
    billNumber: String,
    itemIndex: Number,
    voided: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index(
  { saleId: 1, itemIndex: 1 },
  { unique: true, partialFilterExpression: { source: "sale" } },
);
export default database.model("CustomerPriceHistory", schema);
