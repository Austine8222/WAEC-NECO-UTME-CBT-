const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
    })
  });
}

const db = admin.firestore();

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { email } = JSON.parse(event.body);

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email is required' }) };
    }

    // 1. Generate 6-digit OTP and expiration time (10 minutes from now)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    // 2. Save temporary pre-verification record in Firestore
    await db.collection('users').add({
      email: email,
      otp: otp,
      otpExpires: otpExpires,
      isVerified: false,
      createdAt: new Date().toISOString()
    });

    // 3. Configure Nodemailer transport using your email service credentials
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"WAEC/NECO CBT Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Account Verification Code',
      text: `Your verification code is: ${otp}. It will expire in 10 minutes.`
    };

    // 4. Send email
    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'OTP sent successfully' })
    };

  } catch (error) {
    console.error('Send OTP Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to send OTP email' })
    };
  }
};
