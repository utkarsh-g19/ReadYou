const nodemailer = require("nodemailer");

function isConfigured() {
  return Boolean(
    process.env.EMAIL_USER &&
    process.env.EMAIL_APP_PASSWORD &&
    process.env.EMAIL_TO,
  );
}

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

async function sendNewWinnerAnnouncements(announcements) {
  if (!isConfigured()) {
    throw new Error("Email settings are missing from .env");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD.replace(/\s/g, ""),
    },
  });

  const list = announcements
    .map((item) => {
      const title = escapeHtml(item.title);
      const url = escapeHtml(item.url || "");
      return `<li><a href="${url}">${title}</a></li>`;
    })
    .join("");

  const text = announcements
    .map((item) => `${item.title}\n${item.url || ""}`)
    .join("\n\n");

  await transporter.sendMail({
    from: `"ReadYou" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `ReadYou: ${announcements.length} new Hacktoberfest winner announcement${announcements.length === 1 ? "" : "s"}`,
    text: `ReadYou found new official winner announcements:\n\n${text}`,
    html: `
      <h2>New Hacktoberfest winners 🎉</h2>
      <p>ReadYou discovered these official winner announcements:</p>
      <ul>${list}</ul>
      <p>ReadYou will process any unprocessed announcements automatically.</p>
    `,
  });

  console.log(
    `[Email] Notification sent for ${announcements.length} new announcement(s).`,
  );
}

module.exports = {
  isConfigured,
  sendNewWinnerAnnouncements,
};
