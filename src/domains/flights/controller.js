const axios = require("axios");
const crypto = require("crypto");
const { paystackVerifyTransaction } = require("../../config/paystack");
const FlightBooking = require("./model");
const {
  sendIssuanceEmail,
  sendReservationEmail,
} = require("./../../util/emailService");

const { AMA_API_KEY, NODE_ENV } = process.env;

const AMADEUS_DOMAIN =
  NODE_ENV === "development"
    ? "https://test.travel.api.amadeus.com"
    : "https://travel.api.amadeus.com";

const AMADEUS_HEADERS = {
  "Content-Type": "application/vnd.amadeus+json",
};

const COMMISSION_BY_CARRIER = new Map([
  ["SA", 9],
  ["UR", 3],
  ["HR", 0],
  ["5Z", 0],
  ["TK", 0],
  ["HF", 6],
  ["KQ", 0],
  ["MS", 7],
  ["KP", 6],
  ["WB", 10],
  ["ET", 13],
  ["BA", 12],
  ["AF", 0],
  ["QR", 9],
  ["AT", 6],
  ["AW", 3],
  ["P4", 6],
  ["LH", 0],
  ["DL", 0],
  ["KL", 0],
  ["DT", 6],
]);

function getCommission(iataCode) {
  if (!iataCode) {
    return 0;
  }

  const normalizedCode = String(iataCode).toUpperCase();
  return COMMISSION_BY_CARRIER.get(normalizedCode) ?? 0;
}

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

const flightIssuance = async (data) => {
  try {
    let flight;

    const response = await axios.post(
      `${AMADEUS_DOMAIN}/v1/booking/flight-orders/${data?.id}/issuance`,
      {},
      {
        headers: {
          "Content-Type": "application/vnd.amadeus+json",
          "ama-client-ref": AMA_API_KEY,
          Authorization: `Bearer ${data?.accessToken}`,
        },
      }
    );

    if (response?.data?.data) {
      flight = response?.data?.data;
    }

    if (!flight) {
      throw new Error("Unable to retrieve flight issuance details");
    }

    await sendIssuanceEmail({
      flight,
      data: {
        mails: data?.mails,
        dictionaries: data?.dictionaries,
      },
    });
    return response;
  } catch (err) {
    console.log("error flightReserved", err);
    throw err;
  }
};
const flightReserved = async (data) => {
  try {
    let flight;
    const response = await axios.post(
      `${AMADEUS_DOMAIN}/v1/booking/flight-orders`,
      data?.data,
      {
        headers: {
          "Content-Type": "application/vnd.amadeus+json",
          "ama-client-ref": AMA_API_KEY,
          Authorization: `Bearer ${data?.accessToken}`,
        },
      }
    );

    if (response?.data?.data) {
      flight = response?.data?.data;
    }

    if (!flight) {
      throw new Error("Unable to reserve flight booking");
    }

    await sendReservationEmail({
      flight,
      data: {
        mails: data?.mails,
        dictionaries: data?.dictionaries,
      },
    });
    return response;
  } catch (err) {
    console.log("error flightReserved", err);
    throw err;
  }
};
const flightCommission = async (data) => {
  try {
    const response = await axios.patch(
      `${AMADEUS_DOMAIN}/v1/booking/flight-orders/${data?.id}`,
      data?.data,
      {
        headers: {
          "Content-Type": "application/vnd.amadeus+json",
          "ama-client-ref": AMA_API_KEY,
          Authorization: `Bearer ${data?.accessToken}`,
        },
      }
    );
    return response;
  } catch (err) {
    console.log("error flightReserved", err);
    throw err;
  }
};

const flightBooking = async (bookingInput) => {
  const mails = ["manzotravels@gmail.com"];

  const commissionPercentage = getCommission(
    bookingInput?.flight?.validatingAirlineCodes?.[0]
  );
  try {
    const verifyTransaction = await paystackVerifyTransaction(
      bookingInput.transactionReference
    );
    const commissionPayload = JSON.stringify({
      data: {
        type: "flight-order",
        commissions: [
          {
            controls: ["MANUAL"],
            values: [
              {
                commissionType: "NEW",
                percentage: commissionPercentage,
              },
            ],
          },
        ],
      },
    });

    // checking if transaction already exists
    const existingTransaction = await FlightBooking.findOne({
      reference: bookingInput.transactionReference,
    });
    if (existingTransaction) {
      throw Error(
        "User with the provided Transaction Reference already exists"
      );
    }
    if (verifyTransaction?.data?.status !== "success") {
      throw Error("Paystack transaction was not successful");
    }

    bookingInput?.Travelers?.forEach((traveler) => {
      const email = traveler?.contact?.emailAddress;
      if (email) {
        mails.push(email);
      }
    });

    const uniqueMails = [...new Set(mails)];

    if (!bookingInput?.reservedId) {
      throw new Error("Unable to reserve flight booking");
    }

    await flightCommission({
      id: bookingInput?.reservedId,
      accessToken: bookingInput.accessToken,
      data: commissionPayload,
      mails: uniqueMails,
    });

    const issuanceResponse = await flightIssuance({
      id: bookingInput?.reservedId,
      accessToken: bookingInput.accessToken,
      mails: uniqueMails,
      dictionaries: bookingInput.littelFlightInfo?.[0]?.dictionaries,
    });

    const booking = new FlightBooking({
      FlightBooked: issuanceResponse?.data?.data,
      littelFlightInfo: bookingInput.littelFlightInfo,
      travelers: bookingInput.Travelers,
      reference: bookingInput.transactionReference,
      MFlight: bookingInput?.flight,
      transactionResponse: verifyTransaction,
    });

    return await booking.save();
  } catch (err) {
    const errorMessage = err?.response?.data || err.message || err;
    console.error("error in booking and issuing ticket", errorMessage);
    throw err;
  }
};

const flightReservation = async (bookingInput) => {
  try {
    const mails = ["manzotravels@gmail.com"];

    const offerPayload = JSON.stringify({
      data: {
        type: "flight-order",
        flightOffers: [bookingInput.flight],
        travelers: bookingInput.Travelers,
        formOfPayments: [
          {
            other: {
              method: "CASH",
              flightOfferIds: [bookingInput.flight.id],
            },
          },
        ],
      },
    });

    bookingInput?.Travelers?.forEach((traveler) => {
      const email = traveler?.contact?.emailAddress;
      if (email) {
        mails.push(email);
      }
    });

    const uniqueMails = [...new Set(mails)];

    const reservedResponse = await flightReserved({
      data: offerPayload,
      mails: uniqueMails,
      accessToken: bookingInput.accessToken,
      dictionaries: bookingInput.littelFlightInfo?.[0]?.dictionaries,
    });

    const bookingId = reservedResponse?.data?.data?.id;
    if (!bookingId) {
      throw new Error("Unable to reserve flight booking");
    }

    return bookingId;
  } catch (err) {
    const errorMessage = err?.response?.data || err.message || err;
    console.error("error in booking and issuing ticket", errorMessage);
    throw err;
  }
};

module.exports = {
  multiCityFlight,
  flightOffers,
  flightOffersPricing,
  flightBooking,
  flightReservation,
};
