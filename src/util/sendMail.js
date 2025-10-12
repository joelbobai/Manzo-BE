const nodemailer = require("nodemailer");

const { AUTH_EMAIL_NO_REPLY, AUTH_PASS_NO_REPLY } = process.env;

if (!AUTH_EMAIL_NO_REPLY || !AUTH_PASS_NO_REPLY) {
  throw new Error("Missing email credentials");
}

let transporter = nodemailer.createTransport(
  smtpTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    auth: {
      user: process.env.AUTH_EMAIL_NO_REPLY,
      pass: process.env.AUTH_PASS_NO_REPLY,
    },
    connectionTimeout: 10000, // 10s
  })
);

async function verifyTransporter() {
  try {
    await transporter.verify();
    console.log("Mail transporter ready");
  } catch (error) {
    console.error("Mail transporter verification failed", error);
    throw error;
  }
}
// Joel
/**
 * Send an email using the no-reply transporter.
 * @param {import("nodemailer").SendMailOptions} mailOptions
 */
async function sendEmailNoReply(mailOptions) {
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Failed to send email", error);
    throw error;
  }
}

verifyTransporter().catch(() => {});

module.exports = {
  sendEmailNoReply,
};
