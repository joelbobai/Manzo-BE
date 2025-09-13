const axios = require("axios");

// .Env config
require("dotenv").config();

const tokenUrl = "https://travel.api.amadeus.com/v1/security/oauth2/token";
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
  BEARER_KEY,
  USAP,
} = process.env;

const data = new URLSearchParams({
  "Accept-Encoding": "gzip, deflate",
  grant_type: "client_credentials",
  client_id: PCLIENTID,
  client_secret: PCLIENTSECRET,
  guest_office_id: GUEST_OFFICE_ID,
  USAP: USAP,
  Authorization: `Bearer ${BEARER_KEY}`,
});

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
