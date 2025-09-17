const express = require("express");
const FlightBooking = require("./model");
const mongoose = require("mongoose");
const { getAccessToken } = require("../../config/amadeus");
const AMADEUS_API_URL = "https://test.travel.api.amadeus.com/v2";

let accessToken;

// Refresh access token every 28 minutes (1680000 milliseconds)
async function refreshAccessToken() {
  await getAccessToken().then((value) => {
    accessToken = value;
  });
  console.log("Access token refreshed:", accessToken);
}

// Initial token fetch on server start
refreshAccessToken();

// Set interval to refresh token every 28 minutes
setInterval(refreshAccessToken, 28 * 60 * 1000); // 1680000 ms

const { flightOffers, multiCityFlight } = require("./controller");
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
  if (!accessToken)
    await getAccessToken().then((value) => {
      accessToken = value;
    });
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
    console.log(accessToken);

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
        throw new Error(
          "Return flight date must be after outbound flight date."
        );
      }
    }

    // console.log(FlightSearch.travelers.length);
    console.log(FlightSearch);
    console.log(FlightSearch.searchCriteria.flightFilters.cabinRestrictions);
    let flightResults = await flightOffers([FlightSearch, accessToken]);
    // console.log(flightResults);

    res.status(200).json({
      flightRights: flightResults.data,
      flightRightsDictionaries: flightResults.dictionaries,
    });
  } catch (error) {
    console.error("Error sending from flightOffersSearch:", error);
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

    if (!flightSearch) {
      return res.status(400).send("Empty input fields!");
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

    for (let i = 0; i < flightSearch.length; i++) {
      id = flightSearch[i].id;
      originLocationCode = flightSearch[i].originLocationCode.trim();
      destinationLocationCode = flightSearch[i].destinationLocationCode.trim();
      departureDateTimeRange = flightSearch[i].departureDate.trim();

      if (
        !(
          (
            id &&
            originLocationCode &&
            destinationLocationCode &&
            departureDateTimeRange
          )
          // &&
          // infants &&
          // travelClass &&
          // currencyCode &&
          // departureDate
        )
      ) {
        throw Error("Empty Flight_Offers_Search_multiCity input fields!");
      }
      multiCityFlightSearch.originDestinations[i] = {
        id: flightSearch[i].id,
        originLocationCode: flightSearch[i].originLocationCode,
        destinationLocationCode: flightSearch[i].destinationLocationCode,
        departureDateTimeRange: {
          date: flightSearch[i].departureDate,
        },
      };
    }
    for (let i = 0; i < flightSearch.length; i++) {
      multiCityFlightSearch.flightFilters.cabinRestrictions[i] = {
        cabin: flightSearch[i]?.tripClass,
        coverage: "MOST_SEGMENTS",
        originDestinationIds: [flightSearch[i].id],
      };
    }
    for (let i = 0; i < passenger.adults; i++) {
      let num = i;
      num++;
      multiCityFlightSearch.travelers[i] = {
        id: num,
        travelerType: "ADULT",
        fareOptions: ["STANDARD"],
      };
    }
    let formaTI = multiCityFlightSearch.travelers.length;
    for (let i = 0; i < passenger.children; i++) {
      let num = i;
      num++;

      let index = formaTI + i;
      let indexId = formaTI + num;

      multiCityFlightSearch.travelers[index] = {
        id: indexId,
        travelerType: "CHILD",
        fareOptions: ["STANDARD"],
      };
    }
    let formaTi = multiCityFlightSearch.travelers.length;
    for (let i = 0; i < passenger.infants; i++) {
      let num = i;
      num++;

      let index = formaTi + i;
      let indexId = formaTi + num;

      multiCityFlightSearch.travelers[index] = {
        id: indexId,
        travelerType: "HELD_INFANT",
        fareOptions: ["STANDARD"],
        associatedAdultId: 1,
      };
    }

    multiCityFlightSearch.currencyCode = sanitizedCurrencyCode;

    let multiCityFlightResults = await multiCityFlight([
      multiCityFlightSearch,
      accessToken,
    ]);
    // console.log(multiCityFlightResults);
    res.status(200).json(multiCityFlightResults);
  } catch (error) {
    console.error("Error sending Flight Offers Search MultiCity:", error);
    res.sendStatus(500);
  }
});

module.exports = router;
