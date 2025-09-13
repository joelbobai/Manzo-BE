const https = require("https");

// .Env config
require("dotenv").config();

// url
const { PAYSTACK_SECRET, SECRET_KEY } = process.env;

const paystackInitializePaymentLink = async (info) => {
  try {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.paystack.co",
        port: 443,
        path: "/transaction/initialize",
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      };

      const params = JSON.stringify({
        email: info?.email,
        amount: Number(parseInt(info?.amount) + "00"),
      });

      const payStackRequest = https
        .request(options, (response) => {
          let data = "";

          response.on("data", (chunk) => {
            data += chunk;
          });

          response.on("end", () => {
            try {
              const result = JSON.parse(data);
              resolve(result); // Return the response via resolve
            } catch (error) {
              reject(error); // Handle JSON parsing errors
            }
          });
        })
        .on("error", (error) => {
          console.error(error);
        });

      payStackRequest.write(params);
      payStackRequest.end();
    });
  } catch (error) {
    console.error(
      "Error sending Price Paystack Initialize Payment Link:",
      error
    );
  }
};
const paystackVerifyTransaction = async (reference) => {
  try {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.paystack.co",
        port: 443,
        path: `/transaction/verify/${reference}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
      };

      const payStackRequest = https.request(options, (response) => {
        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          try {
            // console.log(JSON.parse(data));
            const result = JSON.parse(data);
            resolve(result); // Return the response via resolve
          } catch (error) {
            reject(error); // Handle JSON parsing errors
          }
        });
      });

      payStackRequest.on("error", (error) => {
        reject(error); // Return errors via reject
      });

      payStackRequest.end();
    });
  } catch (error) {
    console.error("Error sending Price Paystack Verify Transaction:", error);
  }
};

module.exports = {
  paystackInitializePaymentLink,
  paystackVerifyTransaction,
};
