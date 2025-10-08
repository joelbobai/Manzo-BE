// .Env config
require("dotenv").config();
const nodemailer = require("nodemailer");
const smtpTransport = require("nodemailer-smtp-transport");
const { AUTH_EMAIL_NO_REPLY, AUTH_PASS_NO_REPLY } = process.env;
let transporter = nodemailer.createTransport(
  smtpTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: AUTH_EMAIL_NO_REPLY,
      pass: AUTH_PASS_NO_REPLY,
    },
  })
);

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
