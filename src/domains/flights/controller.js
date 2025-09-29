const axios = require("axios");
const crypto = require("crypto");

const { AMA_API_KEY, NODE_ENV } = process.env;

let Domain =
  NODE_ENV === "development"
    ? "https://test.travel.api.amadeus.com"
    : "https://travel.api.amadeus.com";

const generateAmaClientRef = () => crypto.randomBytes(8).toString("hex");

const requestFlightOffers = async (flightSearch, clientRef) => {
  try {
    const response = await axios.post(
      `${Domain}/v2/shopping/flight-offers`,
      JSON.stringify(flightSearch[0]),
      {
        headers: {
          "Content-Type": "application/vnd.amadeus+json",
          "ama-client-ref": clientRef,
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
const flightOffersPricing = async (flightOffers) => {
  try {
    console.log("flightOffers", flightOffers[1]);
    const response = await axios.post(
      `${Domain}/v1/shopping/flight-offers/pricing?include=detailed-fare-rules,bags`,
      flightOffers[0],
      {
        headers: {
          "Content-Type": "application/vnd.amadeus+json",
          "ama-client-ref": AMA_API_KEY,
          Authorization: `Bearer ${flightOffers[1]}`,
        },
      }
    );
    console.log({
      flightRights: response?.data,
      flightRightsDictionaries: response?.dictionaries,
    });
    return response?.data;
  } catch (err) {
    console.log("error flight-offers-pricing", err?.response?.data?.errors);
    throw err;
  }
};

const flightOffers = (flightSearch) =>
  requestFlightOffers(flightSearch, generateAmaClientRef());

const multiCityFlight = (flightSearch) =>
  requestFlightOffers(flightSearch, AMA_API_KEY);

module.exports = {
  multiCityFlight,
  flightOffers,
  flightOffersPricing,
};
