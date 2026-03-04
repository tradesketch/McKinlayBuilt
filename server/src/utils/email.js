const nodemailer = require('nodemailer');

function getTransporter() {
  // Support multiple email providers
  if (process.env.RESEND_API_KEY) {
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: process.env.RESEND_API_KEY }
    });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const FROM = process.env.SMTP_FROM || 'TradeSketch <noreply@tradesketch.co.uk>';

async function sendVerificationEmail(email, token) {
  const appUrl = process.env.APP_URL || 'https://tradesketch.co.uk';
  const link = `${appUrl}/verify-email?token=${token}`;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: FROM, to: email,
    subject: 'Verify your TradeSketch account',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:40px 20px">
        <h1 style="color:#ffd100;font-size:24px;margin-bottom:8px">TRADESKETCH</h1>
        <h2 style="font-size:18px;margin-bottom:16px">Verify your email</h2>
        <p style="color:#555;margin-bottom:24px">Click the button below to verify your email address and activate your 30-day free trial.</p>
        <a href="${link}" style="display:inline-block;background:#ffd100;color:#111;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">Verify Email</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't create a TradeSketch account, ignore this email.</p>
      </div>
    `
  });
}

async function sendPasswordResetEmail(email, token) {
  const appUrl = process.env.APP_URL || 'https://tradesketch.co.uk';
  const link = `${appUrl}/reset-password?token=${token}`;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: FROM, to: email,
    subject: 'Reset your TradeSketch password',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:40px 20px">
        <h1 style="color:#ffd100;font-size:24px;margin-bottom:8px">TRADESKETCH</h1>
        <h2 style="font-size:18px;margin-bottom:16px">Reset your password</h2>
        <p style="color:#555;margin-bottom:24px">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;background:#ffd100;color:#111;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none">Reset Password</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request this, ignore this email.</p>
      </div>
    `
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
