const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const FlightBookingSchema = new Schema(
  {
    FlightBooked: {
      type: Object,
      required: true,
    },
    MFlight: {
      type: Object,
      required: true,
    },
    littelFlightInfo: {
      type: Object,
      required: true,
    },
    reference: {
      type: String,
      unique: true,
      required: true,
    },
    travelers: { type: Array, required: true },
    transactionResponse: {
      type: Object,
      required: true,
    },
    // email: {
    //   type: String,
    //   required: true,
    // },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const FlightBooked = mongoose.model("FlightBooked", FlightBookingSchema);

module.exports = FlightBooked;
