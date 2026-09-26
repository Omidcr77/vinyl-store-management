import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
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
    costPrice: { type: Number, min: 0 },
    sellingPrice: { type: Number, min: 0 },
    supplier: String,
    img: { type: String, default: "" },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export default mongoose.model("VinylRoll", schema);
