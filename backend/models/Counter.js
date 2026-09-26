import mongoose from "mongoose";
export default mongoose.model(
  "Counter",
  new mongoose.Schema({ _id: String, value: { type: Number, default: 0 } }),
);
