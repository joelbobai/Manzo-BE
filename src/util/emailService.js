const axios = require("axios");

const { MAIL_SERVICE_BASE_URL } = process.env;

if (!MAIL_SERVICE_BASE_URL) {
  throw new Error("MAIL_SERVICE_BASE_URL environment variable is not set");
}

const mailClient = axios.create({
  baseURL: MAIL_SERVICE_BASE_URL,
  timeout: 10000,
});

const sendReservationEmail = async ({ flight, data }) => {
  await mailClient.post("/api/reserve-ticket", { flight, data });
};

const sendIssuanceEmail = async ({ flight, data }) => {
  await mailClient.post("/api/issue-ticket", { flight, data });
};

module.exports = {
  sendReservationEmail,
  sendIssuanceEmail,
};
