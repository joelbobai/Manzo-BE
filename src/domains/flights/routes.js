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
    let { passenger, flightSearch, flexible } = req.body;
    console.log(req.body);
    let originLocationCode = flightSearch[0].originLocationCode.trim();
    let destinationLocationCode =
      flightSearch[0].destinationLocationCode.trim();
    let departureDate = flightSearch[0].departureDateTimeRange.trim();
    // returnDate = returnDate.trim();
    let travelClass = passenger.travelClass.trim();
    let flexibleDate = flexible;
    // currencyCode = currencyCode.trim();
    console.log(accessToken);
    if (
      !(
        originLocationCode &&
        destinationLocationCode &&
        passenger.adults &&
        travelClass &&
        // currencyCode &&
        departureDate
      )
    ) {
      console.log("here =>>", req.body);
      throw Error("Empty Flight_Offers_Search input fields!");
    }

    for (let i = 0; i < flightSearch.length; i++) {
      FlightSearch.searchCriteria.flightFilters.cabinRestrictions[i] = {
        cabin: passenger.travelClass,
        coverage: "MOST_SEGMENTS",
        originDestinationIds: [flightSearch[i].id],
      };
    }
    for (let i = 0; i < flightSearch.length; i++) {
      // let id = flightSearch[i].id.trim();

      let departureDateTimeRange =
        flightSearch[i].departureDateTimeRange.trim();
      if (flexibleDate) {
        FlightSearch.originDestinations[i] = {
          id: flightSearch[i].id,
          originLocationCode: flightSearch[i].originLocationCode,
          destinationLocationCode: flightSearch[i].destinationLocationCode,
          departureDateTimeRange: {
            date: departureDateTimeRange,
            dateWindow: flexibleDate,
          },
        };
      } else {
        FlightSearch.originDestinations[i] = {
          id: flightSearch[i].id,
          originLocationCode: flightSearch[i].originLocationCode,
          destinationLocationCode: flightSearch[i].destinationLocationCode,
          departureDateTimeRange: {
            date: departureDateTimeRange,
          },
        };
      }
    }

    for (let i = 0; i < passenger.adults; i++) {
      let num = i;
      num++;
      FlightSearch.travelers[i] = {
        id: num,
        travelerType: "ADULT",
        fareOptions: ["STANDARD"],
      };
    }
    let formaTI = FlightSearch.travelers.length;
    for (let i = 0; i < passenger.children; i++) {
      let num = i;
      num++;

      let index = formaTI + i;
      let indexId = formaTI + num;

      FlightSearch.travelers[index] = {
        id: indexId,
        travelerType: "CHILD",
        fareOptions: ["STANDARD"],
      };
    }
    let formaTi = FlightSearch.travelers.length;
    for (let i = 0; i < passenger.infants; i++) {
      let num = i;
      num++;

      let index = formaTi + i;
      let indexId = formaTi + num;

      FlightSearch.travelers[index] = {
        id: indexId,
        travelerType: "HELD_INFANT",
        fareOptions: ["STANDARD"],
        associatedAdultId: 1,
      };
    }
    if (flightSearch[0].departureDateTimeRange.length < 2) return true; // Skip validation for one-way flights
    if (flightSearch?.[1]?.departureDateTimeRange) {
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
    const { flightSearch, passenger } = req.body;
    console.log(flightSearch, passenger);

    if (!flightSearch) {
      return res.status(400).send("Empty input fields!");
    }

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
