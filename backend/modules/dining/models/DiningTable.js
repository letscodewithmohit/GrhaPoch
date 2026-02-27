import mongoose from "mongoose";

const diningTableSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Restaurant",
            required: true,
        },
        tableNumber: {
            type: String,
            required: true,
        },
        capacity: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active",
        },
    },
    { timestamps: true }
);

export default mongoose.model("DiningTable", diningTableSchema);
