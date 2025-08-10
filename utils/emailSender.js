// /server/utils/emailSender.js

const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // 1) Create a transporter
  // We are using AWS SES, so we configure it here.
  // These credentials should be in your .env file.
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // 2) Define the email options
  const mailOptions = {
    from: 'EBS Cards Admin <admin@ebscards.com>',
    to: options.email,
    subject: options.subject,
    text: options.message,
    // html:
  };

  // 3) Actually send the email
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
