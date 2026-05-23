const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

async function sendAlertEmail(to, alert, device) {
  const t = getTransporter();
  const levelColor = alert.level === 'CRITICAL' ? '#EF4444' : '#F97316';
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:${levelColor};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">AEWIS Air Quality Alert — ${alert.level}</h2>
      </div>
      <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px">
        <p><strong>Device:</strong> ${device.name}</p>
        <p><strong>Pollutant:</strong> ${alert.pollutant.toUpperCase()}</p>
        <p><strong>Value:</strong> ${alert.value} (Threshold: ${alert.threshold})</p>
        <p><strong>Time:</strong> ${new Date(alert.ts).toLocaleString()}</p>
        <p style="margin-top:24px;font-size:12px;color:#6b7280">
          Login to <a href="${process.env.FRONTEND_URL}">AEWIS Dashboard</a> to acknowledge this alert.
        </p>
      </div>
    </div>
  `;
  await t.sendMail({
    from: `"AEWIS Alerts" <${process.env.EMAIL_USER}>`,
    to,
    subject: `[${alert.level}] Air Quality Alert: ${alert.pollutant.toUpperCase()} on ${device.name}`,
    html,
  });
}

async function sendExportEmail(to, downloadUrl) {
  const t = getTransporter();
  await t.sendMail({
    from: `"AEWIS" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your AEWIS data export is ready',
    html: `<p>Your export is ready. <a href="${downloadUrl}">Download it here</a>. This link expires in 24 hours.</p>`,
  });
}

async function sendResetEmail(to, name, resetUrl) {
  const t = getTransporter();
  await t.sendMail({
    from: `"AEWIS" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Reset your AEWIS password',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1e40af">Password Reset Request</h2>
        <p>Hi ${name},</p>
        <p>Click the button below to reset your password. This link expires in 15 minutes.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
          Reset Password
        </a>
        <p style="font-size:12px;color:#6b7280">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendAlertEmail, sendExportEmail, sendResetEmail };
