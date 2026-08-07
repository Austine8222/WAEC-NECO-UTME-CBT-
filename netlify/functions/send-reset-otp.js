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
const auth = admin.auth();

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { email } = JSON.parse(event.body);

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email is required' }) };
    }

    // 1. Verify that the user actually exists in Firebase Auth before sending a reset code
    try {
      await auth.getUserByEmail(email);
    } catch (err) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No account found with this email address.' }) };
    }

    // 2. Generate 6-digit reset OTP and expiration time (10 minutes from now)
    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    // 3. Save the reset OTP to the user's Firestore document
    const userSnapshot = await db.collection('users').where('email', '==', email).get();
    if (!userSnapshot.empty) {
      const docId = userSnapshot.docs[0].id;
      await db.collection('users').doc(docId).update({
        resetOtp: resetOtp,
        resetOtpExpires: otpExpires
      });
    } else {
      // If Firestore profile is missing, create a tracking record
      await db.collection('users').add({
        email: email,
        resetOtp: resetOtp,
        resetOtpExpires: otpExpires,
        isVerified: true,
        createdAt: new Date().toISOString()
      });
    }

    // 4. Configure Nodemailer transporter
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
      subject: 'Password Reset Code',
      text: `Your password reset code is: ${resetOtp}. It will expire in 10 minutes.`
    };

    // 5. Send email
    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Password reset code sent successfully' })
    };

  } catch (error) {
    console.error('Send Reset OTP Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Failed to send password reset email' })
    };
  }
};
