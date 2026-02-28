import mongoose from "mongoose";

const diningBookingSchema = new mongoose.Schema(
    {
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Restaurant",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        guestName: {
            type: String,
        },
        guestPhone: {
            type: String,
        },
        tableId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DiningTable",
        },
        tableNumber: {
            type: String,
            required: true,
        },
        guests: {
            type: Number,
            required: true,
        },
        date: {
            type: String,
            required: true,
        },
        time: {
            type: String,
            required: true,
        },
        bookingStatus: {
            type: String,
            enum: ["Pending", "Confirmed", "Rejected", "Cancelled", "Completed"],
            default: "Pending",
        },
    },
    { timestamps: true }
);

export default mongoose.model("DiningBooking", diningBookingSchema);
