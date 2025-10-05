const axios = require("axios");

// .Env config
require("dotenv").config();

// url
const {
  CLIENT_ID,
  CLIENT_SECRET,
  PCLIENTID,
  PCLIENTSECRET,
  CLIENTID,
  CLIENTSECRET,
  GUEST_OFFICE_ID,
  AMA_API_KEY,
  NODE_ENV,
  BEARER_KEY,
  USAP,
} = process.env;

const tokenUrl =
  NODE_ENV === "development"
    ? "https://test.travel.api.amadeus.com/v1/security/oauth2/token"
    : "https://travel.api.amadeus.com/v1/security/oauth2/token";

const data = new URLSearchParams({
  "Accept-Encoding": "gzip, deflate",
  grant_type: "client_credentials",
  client_id: NODE_ENV === "development" ? CLIENTID : PCLIENTID,
  client_secret: NODE_ENV === "development" ? CLIENTSECRET : PCLIENTSECRET,
  guest_office_id: GUEST_OFFICE_ID,
  USAP: USAP,
  Authorization: `Bearer ${BEARER_KEY}`,
});
console.log(tokenUrl);
const getAccessToken = async () => {
  try {
    const response = await axios.post(tokenUrl, data.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "ama-client-ref": AMA_API_KEY,
      },
    });

    let accessToken = response.data.access_token;
    // console.log("response:", response);
    // console.log("Access Token:", accessToken);

    return Promise.resolve(accessToken); // Return the token if needed for further use
  } catch (error) {
    console.error(
      "Error fetching access token:",
      error.response ? error.response.data : error.message
    );
  }
};

//getAccessToken();

module.exports = {
  getAccessToken,
};
