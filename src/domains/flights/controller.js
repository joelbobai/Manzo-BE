const FlightBooking = require("./model");

// const { sendEmailNoReply } = require("./../../util/sendMail");
// const IataAirport = require("./public/IATA_airports.json");
const axios = require("axios");
// const { paystackVerifyTransaction } = require("../../config/paystack");
const { AMA_API_KEY, BEARER_KEY } = process.env;

let Domain = "https://travel.api.amadeus.com";

const flightOffers = async (flightSearch) => {
  try {
    const response = await axios.post(
      `${Domain}/v2/shopping/flight-offers`,
      JSON.stringify(flightSearch[0]),
      {
        headers: {
          "Content-Type": "application/vnd.amadeus+json",
          "ama-client-ref": generateAmaClientRef(),
          Authorization: `Bearer ${flightSearch[1]}`,
        },
      }
    );

    console.log({
      flightRights: response?.data,
      flightRightsDictionaries: response?.dictionaries,
    });
    return response?.data;
  } catch (err) {
    console.log("error", err?.response?.data?.errors);
    throw err;
  }
};

const multiCityFlight = async (flightSearch) => {
  try {
    const response = await axios.post(
      `${Domain}/v2/shopping/flight-offers`,
      JSON.stringify(flightSearch[0]),
      {
        headers: {
          "Content-Type": "application/vnd.amadeus+json",
          "ama-client-ref": AMA_API_KEY,
          Authorization: `Bearer ${flightSearch[1]}`,
        },
      }
    );
    console.log({
      flightRights: response.data,
      flightRightsDictionaries: response.dictionaries,
    });
    return response.data;
  } catch (err) {
    console.log("error", err.response.data.errors);
    throw err;
  }
};

module.exports = {
  multiCityFlight,
  flightOffers,
};
