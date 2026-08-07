// netlify/functions/send-reset-otp.js
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { email, otp } = JSON.parse(event.body);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: '"WAEC/NECO CBT Support" <no-reply@waecnecoutmecbt.netlify.app>',
      to: email,
      subject: 'Password Reset Code',
      text: `Your password reset code is: ${otp}. It will expire in 10 minutes.`
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Reset code sent successfully' })
    };
  } catch (error) {
    console.error('Error sending reset email:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
