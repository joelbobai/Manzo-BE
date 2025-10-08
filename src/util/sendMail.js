// .Env config
require("dotenv").config();
const dns = require("dns");
const nodemailer = require("nodemailer");

// Render instances sometimes default to IPv6 first which Gmail does not
// consistently accept for SMTP. Prioritise IPv4 lookups to avoid ENETUNREACH
// errors when establishing the SMTP connection.
dns.setDefaultResultOrder?.("ipv4first");
const { AUTH_EMAIL_NO_REPLY, AUTH_PASS_NO_REPLY } = process.env;
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: AUTH_EMAIL_NO_REPLY,
    pass: AUTH_PASS_NO_REPLY,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.log(error);
  } else {
    console.log("Mail Is Ready");
    console.log(success);
  }
});

const sendEmailNoReply = async (mailOptions) => {
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};

module.exports = {
  sendEmailNoReply,
};
