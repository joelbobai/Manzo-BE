const axios = require("axios");
const IataAirport = require("./public/IATA_airports.json");
const crypto = require("crypto");
const { paystackVerifyTransaction } = require("../../config/paystack");
const FlightBooking = require("./model");
const { sendEmailNoReply } = require("./../../util/sendMail");

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

const filterIataAirport = (iataCode) => {
  const newFilterData = IataAirport.find((item) => {
    return (
      item.IATA && item.IATA.toLowerCase().includes(iataCode.toLowerCase())
    );
  });

  return newFilterData;
};
const money = new Intl.NumberFormat("en-us", {
  currency: "NGN",
  style: "currency",
});

const flightIssuance = async (data) => {
  try {
    let flight;

    let Html;
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

    const bookingRef = flight?.associatedRecords?.[0]?.reference || "";
    const issuanceRecord =
      flight?.associatedRecords?.[1] || flight?.associatedRecords?.[0];
    const issueDate = issuanceRecord?.creationDate
      ? new Date(issuanceRecord.creationDate).toDateString()
      : new Date().toDateString();
    const airlineCode = flight.flightOffers[0].validatingAirlineCodes[0];

    const travelers = flight.travelers
      .map((traveler) => {
        const ticket = flight.tickets.find((t) => t.travelerId === traveler.id);
        return `
        <p><b>${traveler.name.firstName} ${traveler?.name?.middleName} ${traveler.name.lastName}</b> (${traveler.gender})</p>
        <p>E-Ticket: <b>${ticket.documentNumber}</b></p>
        <p>Contact: ${traveler.contact.emailAddress} | +${traveler.contact.phones[0].countryCallingCode} ${traveler.contact.phones[0].number}</p>
        <hr>`;
      })
      .join("");
    data.dictionaries;
    const segments = (data) => {
      let seg = data.segments
        .map((segment, index) => {
          return ` <p><b>Flight:</b> ${segment.carrierCode} ${
            segment.number
          }</p>
                <p><b>Departure:</b> <b>(${
                  segment.departure.iataCode
                })</b> ${` ${
            filterIataAirport(segment?.departure?.iataCode)?.Airport_name
          },  ${
            filterIataAirport(segment?.departure?.iataCode)?.Location_served
          }`}  (Terminal ${segment.departure.terminal}) - ${new Date(
            segment.departure.at
          ).toLocaleString()}</p>
                <p><b>Arrival:</b> <b>(${segment.arrival.iataCode})</b> ${`${
            filterIataAirport(segment?.arrival?.iataCode)?.Airport_name
          },  ${
            filterIataAirport(segment?.arrival?.iataCode)?.Location_served
          }`} (Terminal ${segment.arrival.terminal}) - ${new Date(
            segment.arrival.at
          ).toLocaleString()}</p>
           <p><b>Aircraft:</b> ${segment.aircraft.code}</p>
                <p><b>Booking Status:</b> ${segment.bookingStatus}</p>
                <p><b>Stops:</b> ${segment.numberOfStops} (Non-stop flight)</p>
          `;
        })
        .join("");
      return seg;
    };

    const flightDetails = flight.flightOffers[0].itineraries
      .map((itinerary, index) => {
        // const segment = itinerary.segments[0];
        return `
            <section style="background-color: rgba(0, 43, 116, 0.105); padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                <h3>${index === 0 ? "Departure" : "Return"} Flight</h3>
               
                ${segments(itinerary)}
        
        
               
            </section>
        `;
      })
      .join("");

    Html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Flight Ticket Issuance Confirmation</title>
    </head>
    <body style="font-family: Arial, sans-serif;">
        <div style="width: 100%; max-width: 600px; margin: auto; padding: 20px; background: #f4f4f4; border-radius: 10px;">
            <header style="background: #ff5900; color: white; padding: 15px; text-align: center; border-radius: 5px;">
                <h2>Your Flight Ticket Issuance Confirmation</h2>
            </header>

            <section style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
                <h3>Booking Information</h3>
                <p><b>Booking Reference:</b> ${bookingRef}</p>
                <p><b>Issue Date:</b> ${issueDate}</p>
                <p><b>Validating Airline:</b> ${airlineCode}</p>
            </section>

            <section style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
                <h3>Traveler & Ticket Details</h3>
                ${travelers}
            </section>

            ${flightDetails}

            <section style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
                <h3>Pricing</h3>
                <p><b>Total Price:</b>  ${money.format(
                  flight.flightOffers[0].price.grandTotal
                )}</p>
            </section>

            <footer style="background: #ddd; padding: 10px; text-align: center; border-radius: 5px; margin-top: 10px;">
                <p>For any inquiries, please contact <b>Manzo Travels</b> at <a href="mailto:manzotravels@gmail.com">manzotravels@gmail.com</a>.</p>
                <p>&copy; 2025 Manzo Travels & Tours</p>
            </footer>
        </div>
    </body>
    </html>`;

    const mailOptions = {
      from: "Manzo Travels <noreply@manzotravels.com>",
      to: data?.mails.join(","),
      subject: "Ticket Issue Confirmation",
      html: Html,
    };

    await sendEmailNoReply(mailOptions);
    return response;
  } catch (err) {
    console.log("error flightReserved", err);
    throw err;
  }
};
const flightReserved = async (data) => {
  try {
    let flight;
    let Html;
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

    const bookingRef = flight?.associatedRecords?.[0]?.reference || "";
    const issueDate = flight?.associatedRecords?.[0]?.creationDate
      ? new Date(flight.associatedRecords[0].creationDate).toDateString()
      : new Date().toDateString();

    const travelers = flight.travelers
      .map(
        (traveler) => `
          <p><b>${traveler.name.firstName} ${traveler?.name?.middleName} ${traveler.name.lastName}</b> (${traveler.travelerType})</p>
          <p>DOB: ${traveler.dateOfBirth}</p>
          <p>Contact: ${traveler.contact.emailAddress} | +${traveler.contact.phones[0].countryCallingCode} ${traveler.contact.phones[0].number}</p>
      `
      )
      .join("");

    const segments = (data) => {
      let seg = data.segments
        .map((segment, index) => {
          return ` <p><b>Flight:</b> ${segment.carrierCode} ${
            segment.number
          }</p>
                  <p><b>Departure:</b> <b>(${
                    segment.departure.iataCode
                  })</b> ${` ${
            filterIataAirport(segment?.departure?.iataCode)?.Airport_name
          },  ${
            filterIataAirport(segment?.departure?.iataCode)?.Location_served
          }`}  (Terminal ${segment.departure.terminal}) - ${new Date(
            segment.departure.at
          ).toLocaleString()}</p>
                  <p><b>Arrival:</b> <b>(${segment.arrival.iataCode})</b> ${`${
            filterIataAirport(segment?.arrival?.iataCode)?.Airport_name
          },  ${
            filterIataAirport(segment?.arrival?.iataCode)?.Location_served
          }`} (Terminal ${segment.arrival.terminal}) - ${new Date(
            segment.arrival.at
          ).toLocaleString()}</p>
             <p><b>Aircraft:</b> ${segment.aircraft.code}</p>
                  
                  <p><b>Stops:</b> ${
                    segment.numberOfStops
                  } (Non-stop flight)</p>
            `;
        })
        .join("");
      return seg;
    };

    const flightDetails = flight.flightOffers[0].itineraries
      .map((itinerary, index) => {
        const segment = itinerary.segments[0];
        return `
              <section style="background-color: rgba(0, 43, 116, 0.105); padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                  <h3>${index === 0 ? "Departure" : "Return"} Flight</h3>
                 
                 ${segments(itinerary)}
              </section>
          `;
      })
      .join("");

    Html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>Flight Booking has been Reserved</title>
      </head>
      <body style="font-family: Arial, sans-serif;">
          <div style="width: 100%; max-width: 600px; margin: auto; padding: 20px; background: #f4f4f4; border-radius: 10px;">
              <header style="background: #ff5900; color: white; padding: 15px; text-align: center; border-radius: 5px;">
                  <h2>Your Flight Booking has been Reserved</h2>
              </header>
  
              <section style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
                  <h3>Booking Information</h3>
                  <p><b>Booking Reference:</b> ${bookingRef}</p>
                  <p><b>Issue Date:</b> ${issueDate}</p>
              </section>
  
              <section style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
                  <h3>Traveler Details</h3>
                  ${travelers}
              </section>
  
              ${flightDetails}
  
              <section style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
                  <h3>Pricing</h3>
                  <p><b>Total Price:</b>  ${money.format(
                    flight.flightOffers[0].price.grandTotal
                  )}</p>
              </section>
  
              <footer style="background: #ddd; padding: 10px; text-align: center; border-radius: 5px; margin-top: 10px;">
                  <p>For any inquiries, please contact <b>Manzo Travels</b> at <a href="mailto:manzotravels@gmail.com">manzotravels@gmail.com</a>.</p>
                  <p>&copy; 2025 Manzo Travels & Tours</p>
              </footer>
          </div>
      </body>
      </html>
      `;
    console.log(data?.mails);
    const mailOptions = {
      from: "Manzo Travels <noreply@manzotravels.com>",
      to: data?.mails.join(","),
      subject: "Your flight booking has been Reserved",
      html: Html,
    };

    await sendEmailNoReply(mailOptions);
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

    await flightCommission({
      id: bookingId,
      accessToken: bookingInput.accessToken,
      data: commissionPayload,
      mails: uniqueMails,
    });

    const issuanceResponse = await flightIssuance({
      id: bookingId,
      accessToken: bookingInput.accessToken,
      mails: uniqueMails,
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

module.exports = {
  multiCityFlight,
  flightOffers,
  flightOffersPricing,
  flightBooking,
};
