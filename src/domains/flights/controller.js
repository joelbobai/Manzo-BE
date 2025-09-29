const axios = require("axios");
const crypto = require("crypto");

const { AMA_API_KEY, NODE_ENV } = process.env;

const AMADEUS_DOMAIN =
  NODE_ENV === "development"
    ? "https://test.travel.api.amadeus.com"
    : "https://travel.api.amadeus.com";

const AMADEUS_HEADERS = {
  "Content-Type": "application/vnd.amadeus+json",
};

const generateAmaClientRef = () => crypto.randomBytes(8).toString("hex");

const logAmadeusError = (endpoint, error) => {
  const amadeusErrors = error?.response?.data?.errors;
  console.error(
    `Amadeus request failed for ${endpoint}:`,
    amadeusErrors || error.message
  );
};

const postToAmadeus = async ({ endpoint, payload, token, clientRef }) => {
  try {
    const { data } = await axios.post(`${AMADEUS_DOMAIN}${endpoint}`, payload, {
      headers: {
        ...AMADEUS_HEADERS,
        "ama-client-ref": clientRef,
        Authorization: `Bearer ${token}`,
      },
    });

    return data;
  } catch (error) {
    logAmadeusError(endpoint, error);
    throw error;
  }
};

const flightOffers = ({ payload, token }) =>
  postToAmadeus({
    endpoint: "/v2/shopping/flight-offers",
    payload,
    token,
    clientRef: generateAmaClientRef(),
  });

const multiCityFlight = ({ payload, token }) =>
  postToAmadeus({
    endpoint: "/v2/shopping/flight-offers",
    payload,
    token,
    clientRef: AMA_API_KEY,
  });

const flightOffersPricing = ({ payload, token }) =>
  postToAmadeus({
    endpoint:
      "/v1/shopping/flight-offers/pricing?include=detailed-fare-rules,bags",
    payload,
    token,
    clientRef: AMA_API_KEY,
  });

module.exports = {
  multiCityFlight,
  flightOffers,
  flightOffersPricing,
};
