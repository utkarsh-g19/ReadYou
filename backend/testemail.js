require("dotenv").config({
  path: require("node:path").resolve(__dirname, "../.env"),
});

const nodemailer = require("nodemailer");

async function testEmail() {
  const { EMAIL_USER, EMAIL_APP_PASSWORD, EMAIL_TO } = process.env;

  if (!EMAIL_USER || !EMAIL_APP_PASSWORD || !EMAIL_TO) {
    throw new Error(
      "Missing EMAIL_USER, EMAIL_APP_PASSWORD, or EMAIL_TO in .env",
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_APP_PASSWORD.replace(/\s/g, ""),
    },
  });

  await transporter.sendMail({
    from: `"ReadYou" <${EMAIL_USER}>`,
    to: EMAIL_TO,
    subject: "ReadYou — Email notification test",
    text: [
      "Hey!",
      "",
      "This is a test email from ReadYou.",
      "Your email configuration is working.",
      "ReadYou's winner-announcement notification is ready to be tested.",
    ].join("\n"),
  });

  console.log(`Test email sent successfully to ${EMAIL_TO}`);
}

testEmail().catch((error) => {
  console.error("Email test failed:", error.message);
  process.exitCode = 1;
});
