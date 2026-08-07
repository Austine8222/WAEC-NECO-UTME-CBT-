// netlify/functions/send-otp.js
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { email, otp } = JSON.parse(event.body);

    // Configure your email transporter (e.g., Gmail, SendGrid, or SMTP)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Your email address set in Netlify Environment Variables
        pass: process.env.EMAIL_PASS  // Your email app password
      }
    });

    const mailOptions = {
      from: '"WAEC/NECO CBT Support" <no-reply@waecnecoutmecbt.netlify.app>',
      to: email,
      subject: 'Your Verification Code',
      text: `Your verification code is: ${otp}. It will expire in 10 minutes.`
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'OTP sent successfully' })
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
