import mongoose from "mongoose";
// A shared transaction lock protects bootstrap and concurrent last-admin edits.
export default mongoose.model(
  "AuthGuard",
  new mongoose.Schema({ _id: String, revision: { type: Number, default: 0 } }),
);
