const express = require("express");
const FlightBooking = require("./model");
const mongoose = require("mongoose");
const { getAccessToken } = require("../../config/amadeus");
const { SECRET_KEY } = process.env;
const CryptoJS = require("crypto-js");
const {
  flightOffers,
  multiCityFlight,
  flightBooking,
  flightOffersPricing,
} = require("./controller");

let accessToken;
let accessTokenPromise;

const TOKEN_REFRESH_INTERVAL_MS = 28 * 60 * 1000;

const refreshAccessToken = async () => {
  try {
    accessToken = await getAccessToken();
    return accessToken;
  } catch (error) {
    console.error("Failed to refresh access token", error);
    throw error;
  }
};

const ensureAccessToken = async () => {
  if (accessToken) {
    return accessToken;
  }

  if (!accessTokenPromise) {
    accessTokenPromise = refreshAccessToken().finally(() => {
      accessTokenPromise = null;
    });
  }

  return accessTokenPromise;
};

refreshAccessToken().catch(() => {
  // Failure is logged in refreshAccessToken. Subsequent requests will retry.
});

setInterval(() => {
  refreshAccessToken().catch(() => {
    // Failure is logged above; keep attempting refresh silently.
  });
}, TOKEN_REFRESH_INTERVAL_MS);

const router = express.Router();

// Helper to validate request payload for flight offers search
function validateFlightOffersSearchInput(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    errors.push("Request body must be an object");
  }

  const { passenger, flightSearch, flexible, currencyCode } = body || {};

  if (!passenger || typeof passenger !== "object") {
    errors.push("passenger is required");
  } else {
    if (typeof passenger.adults !== "number" || passenger.adults < 1)
      errors.push("passenger.adults must be a positive number");
    if (typeof passenger.children !== "number" || passenger.children < 0)
      errors.push("passenger.children must be a non-negative number");
    if (typeof passenger.infants !== "number" || passenger.infants < 0)
      errors.push("passenger.infants must be a non-negative number");
    if (
      !passenger.travelClass ||
      typeof passenger.travelClass !== "string" ||
      passenger.travelClass.trim() === ""
    )
      errors.push("passenger.travelClass is required");
  }

  if (!Array.isArray(flightSearch) || flightSearch.length === 0) {
    errors.push("flightSearch must be a non-empty array");
  } else {
    flightSearch.forEach((fs, idx) => {
      if (
        !fs.id ||
        typeof String(fs.id) !== "string" ||
        String(fs.id).trim() === ""
      )
        errors.push(`flightSearch[${idx}].id is required`);
      if (
        !fs.originLocationCode ||
        typeof fs.originLocationCode !== "string" ||
        fs.originLocationCode.trim() === ""
      )
        errors.push(`flightSearch[${idx}].originLocationCode is required`);
      if (
        !fs.destinationLocationCode ||
        typeof fs.destinationLocationCode !== "string" ||
        fs.destinationLocationCode.trim() === ""
      )
        errors.push(`flightSearch[${idx}].destinationLocationCode is required`);
      if (
        !fs.departureDateTimeRange ||
        typeof fs.departureDateTimeRange !== "string" ||
        fs.departureDateTimeRange.trim() === ""
      )
        errors.push(`flightSearch[${idx}].departureDateTimeRange is required`);
    });
  }

  let sanitizedCurrencyCode = "NGN";
  if (currencyCode !== undefined) {
    if (typeof currencyCode !== "string" || currencyCode.trim() === "") {
      errors.push("currencyCode must be a non-empty string");
    } else {
      sanitizedCurrencyCode = currencyCode.trim().toUpperCase();
    }
  }

  if (errors.length) {
    return { error: errors.join(", ") };
  }

  const sanitizedPassenger = {
    adults: passenger.adults,
    children: passenger.children,
    infants: passenger.infants,
    travelClass: passenger.travelClass.trim(),
  };
  const sanitizedFlightSearch = flightSearch.map((fs) => ({
    id: fs.id,
    originLocationCode: fs.originLocationCode.trim(),
    destinationLocationCode: fs.destinationLocationCode.trim(),
    departureDateTimeRange: fs.departureDateTimeRange.trim(),
  }));

  return {
    value: {
      passenger: sanitizedPassenger,
      flightSearch: sanitizedFlightSearch,
      flexible,
      currencyCode: sanitizedCurrencyCode,
    },
  };
}

// Middleware to ensure authentication
router.use(async (req, res, next) => {
  try {
    await ensureAccessToken();
  } catch (error) {
    return res.status(503).json({ error: "Unable to obtain access token" });
  }

  if (!accessToken) {
    return res.status(503).json({ error: "Unable to obtain access token" });
  }

  next();
});

router.post("/createdIssuanceBooked", async (req, res) => {
  try {
    const { bookingId } = req.body;
    console.log(req.body);
    if (!bookingId || bookingId.trim() === "") {
      return res.status(400).json({ error: "Empty bookingId input field!" });
    }

    // Validate ObjectId if using MongoDB's _id field
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: "Invalid bookingId format!" });
    }

    const createdIssuance = await FlightBooking.findOne({ _id: bookingId });

    if (!createdIssuance) {
      return res.status(404).json({ error: "Issuance not found!" });
    }

    res.status(200).json(createdIssuance);
  } catch (error) {
    console.error("Error fetching issuance:", error);
    res.status(500).json({ error: "Internal server error" });
    // .send(error.message)
  }
});

// Flight Offers Search => Flight Search Result
router.post("/flightOffersSearch", async (req, res) => {
  try {
    let FlightSearch = {
      currencyCode: "NGN",
      originDestinations: [],
      travelers: [],
      sources: ["GDS"],

      searchCriteria: {
        pricingOptions: {
          fareType: ["PUBLISHED"],
          // includedCheckedBagsOnly: false,
        },
        // addOneWayOffers: true,

        maxFlightOffers: 100,
        allowAlternativeFareOptions: true,
        maxUpsellOffers: 3,
        additionalInformation: {
          chargeableCheckedBags: true,
          brandedFares: true,
          fareRules: true,
        },

        flightFilters: {
          cabinRestrictions: [],
          connectionRestriction: {
            maxNumberOfConnections: 2,
          },
          // carrierRestrictions: {
          //   blacklistedInEUAllowed: false,
          // },
        },
      },
    };
    const { error, value } = validateFlightOffersSearchInput(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    let { passenger, flightSearch, flexible, currencyCode } = value;
    let flexibleDate = flexible;
    console.log(value);

    FlightSearch.currencyCode = currencyCode;

    FlightSearch.searchCriteria.flightFilters.cabinRestrictions =
      flightSearch.map(({ id }) => ({
        cabin: passenger.travelClass,
        coverage: "MOST_SEGMENTS",
        originDestinationIds: [id],
      }));

    FlightSearch.originDestinations = flightSearch.map(
      ({
        id,
        originLocationCode,
        destinationLocationCode,
        departureDateTimeRange,
      }) => ({
        id,
        originLocationCode,
        destinationLocationCode,
        departureDateTimeRange: flexibleDate
          ? { date: departureDateTimeRange, dateWindow: flexibleDate }
          : { date: departureDateTimeRange },
      })
    );

    const buildTravelers = ({ adults = 0, children = 0, infants = 0 }) => {
      let idCounter = 1;
      const create = (count, travelerType, extra = {}) =>
        Array.from({ length: count }, () => ({
          id: idCounter++,
          travelerType,
          fareOptions: ["STANDARD"],
          ...extra,
        }));

      return [
        ...create(adults, "ADULT"),
        ...create(children, "CHILD"),
        ...create(infants, "HELD_INFANT", { associatedAdultId: 1 }),
      ];
    };

    FlightSearch.travelers = buildTravelers(passenger);
    // Only validate return date for round trips
    if (flightSearch.length > 1 && flightSearch[1]?.departureDateTimeRange) {
      const firstDeparture = new Date(flightSearch[0].departureDateTimeRange);
      const secondDeparture = new Date(flightSearch[1].departureDateTimeRange);
      if (secondDeparture < firstDeparture) {
        return res.status(400).json({
          error: "Return flight date must be after outbound flight date.",
        });
      }
    }

    // console.log(FlightSearch.travelers.length);
    console.log(FlightSearch);
    console.log(FlightSearch.searchCriteria.flightFilters.cabinRestrictions);
    const flightResults = await flightOffers({
      payload: FlightSearch,
      token: accessToken,
    });
    console.log({
      flightRights: flightResults.data,
      flightRightsDictionaries: flightResults.dictionaries,
    });

    res.status(200).json({
      flightRights: flightResults.data,
      flightRightsDictionaries: flightResults.dictionaries,
    });
  } catch (error) {
    console.error("Error sending from flightOffersSearch:", error);
    res.status(500).json({ error: "Unable to fetch flight offers" });
  }
});

// Flight Offers Price Lookup => Flight Search for the Price
router.post("/flightPriceLookup", async (req, res) => {
  try {
    const { flight } = req.body;
    if (!flight) {
      return res.status(400).send("Empty input fields!");
    }
    if (Object.keys(flight).length === 0) {
      return res.status(400).send("Empty input fields!");
    }

    const priceLookup = {
      data: {
        type: "flight-offers-pricing",
        flightOffers: [flight],
      },
    };
    console.log("Price Lookup Payload:", priceLookup);

    const PricingResults = await flightOffersPricing({
      payload: priceLookup,
      token: accessToken,
    });
    console.log("Pricing Results:", PricingResults);
    res.status(200).json(PricingResults);
  } catch (error) {
    console.error("Error sending Price Lookup:", error);
    res.sendStatus(500);
  }
});

// Flight Offers Search multiCity => Flight Search Result
router.post("/flightOffersSearchMultiCity", async (req, res) => {
  try {
    let multiCityFlightSearch = {
      currencyCode: "NGN",
      originDestinations: [],
      travelers: [],
      sources: ["GDS"],

      searchCriteria: {
        pricingOptions: {
          fareType: ["PUBLISHED"],
          includedCheckedBagsOnly: false,
        },
        fareRules: true,
        // addOneWayOffers: true,
        maxFlightOffers: 250,
        allowAlternativeFareOptions: true,
        additionalInformation: {
          chargeableCheckedBags: true,
          brandedFares: true,
          fareRules: true,
        },
      },
      flightFilters: {
        cabinRestrictions: [],
        connectionRestriction: {
          maxNumberOfConnections: 2,
        },
      },
    };
    const { flightSearch, passenger, currencyCode } = req.body;
    console.log(flightSearch, passenger, currencyCode);

    if (!Array.isArray(flightSearch) || flightSearch.length === 0) {
      return res.status(400).json({
        error: "flightSearch must be a non-empty array",
      });
    }

    if (!passenger || typeof passenger !== "object") {
      return res.status(400).json({ error: "passenger details are required" });
    }

    const passengerCounts = {
      adults: passenger.adults,
      children: passenger.children,
      infants: passenger.infants,
    };

    const invalidPassengerField = Object.entries(passengerCounts).find(
      ([key, value]) => !Number.isInteger(value) || value < 0
    );

    if (invalidPassengerField) {
      const [field] = invalidPassengerField;
      return res.status(400).json({
        error: `${field} must be provided as a non-negative integer`,
      });
    }

    if (passengerCounts.adults < 1) {
      return res
        .status(400)
        .json({ error: "adults must be provided and at least 1" });
    }

    if (
      currencyCode !== undefined &&
      (typeof currencyCode !== "string" || currencyCode.trim() === "")
    ) {
      return res
        .status(400)
        .send("currencyCode must be provided as a non-empty string!");
    }

    const sanitizedCurrencyCode =
      typeof currencyCode === "string" && currencyCode.trim() !== ""
        ? currencyCode.trim().toUpperCase()
        : "NGN";

    const sanitizedSegments = flightSearch.map((segment, index) => {
      const {
        id,
        originLocationCode,
        destinationLocationCode,
        departureDate,
        tripClass,
      } = segment || {};

      if (
        !id ||
        !originLocationCode ||
        !destinationLocationCode ||
        !departureDate
      ) {
        throw new Error(
          `Empty Flight_Offers_Search_multiCity input fields at index ${index}!`
        );
      }

      return {
        id,
        originLocationCode: originLocationCode.trim(),
        destinationLocationCode: destinationLocationCode.trim(),
        departureDate: departureDate.trim(),
        tripClass: typeof tripClass === "string" ? tripClass.trim() : undefined,
      };
    });

    sanitizedSegments.forEach((segment, index) => {
      multiCityFlightSearch.originDestinations[index] = {
        id: segment.id,
        originLocationCode: segment.originLocationCode,
        destinationLocationCode: segment.destinationLocationCode,
        departureDateTimeRange: {
          date: segment.departureDate,
        },
      };

      multiCityFlightSearch.flightFilters.cabinRestrictions[index] = {
        cabin: segment.tripClass,
        coverage: "MOST_SEGMENTS",
        originDestinationIds: [segment.id],
      };
    });

    const buildTravelersList = ({ adults = 0, children = 0, infants = 0 }) => {
      const travelers = [];

      const createTravelers = (count, travelerType, extra = {}) => {
        for (let index = 0; index < count; index += 1) {
          travelers.push({
            id: travelers.length + 1,
            travelerType,
            fareOptions: ["STANDARD"],
            ...extra,
          });
        }
      };

      createTravelers(adults, "ADULT");
      createTravelers(children, "CHILD");
      createTravelers(infants, "HELD_INFANT", { associatedAdultId: 1 });

      return travelers;
    };

    multiCityFlightSearch.travelers = buildTravelersList(passengerCounts);
    multiCityFlightSearch.currencyCode = sanitizedCurrencyCode;

    const multiCityFlightResults = await multiCityFlight({
      payload: multiCityFlightSearch,
      token: accessToken,
    });
    console.log({
      flightRights: multiCityFlightResults.data,
      flightRightsDictionaries: multiCityFlightResults.dictionaries,
    });
    res.status(200).json({
      flightRights: multiCityFlightResults.data,
      flightRightsDictionaries: multiCityFlightResults.dictionaries,
    });
  } catch (error) {
    console.error("Error sending Flight Offers Search MultiCity:", error);
    if (
      typeof error?.message === "string" &&
      error.message.includes("Flight_Offers_Search_multiCity")
    ) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Unable to process multi-city search" });
  }
});

// Flight Create Orders => Flight Booking
router.post("/issueTicket", async (req, res) => {
  try {
    let Travelers = [];
    let { hashedData } = req.body;
    // console.log("hashedData", hashedData);
    const calculatedHash = CryptoJS.AES.decrypt(hashedData, SECRET_KEY);
    let decryptedData = JSON.parse(calculatedHash.toString(CryptoJS.enc.Utf8));
    let { flight, travelers, transactionReference, littelFlightInfo } =
      decryptedData;
    transactionReference = transactionReference.trim();
    // console.log("jjjjjj", decryptedData);

    if (!transactionReference) {
      return res.status(400).send("Empty transaction Referenc input fields!");
    }
    if (!littelFlightInfo) {
      return res.status(400).send("Empty flight Create Orders input fields!");
    }
    if (!flight) {
      return res.status(400).send("Empty flight Create Orders input fields!");
    }
    if (!travelers) {
      return res.status(400).send("Empty travelers input fields!");
    }
    if (Object.keys(flight).length === 0) {
      return res.status(400).send("Empty flight Create Orders input fields!");
    }
    Travelers = travelers;

    const booked = await flightBooking({
      transactionReference,
      Travelers,
      flight,
      littelFlightInfo,
      accessToken,
    });
    console.log("booked", booked?.FlightBooked?.id);
    res.status(200).json({ issueId: booked?.FlightBooked?.id });
  } catch (error) {
    console.error("Error sending booking:1", error);
    console.error("Error sending boooking:2", error?.response?.data?.errors);
    res.sendStatus(500);
  }
});

module.exports = router;
