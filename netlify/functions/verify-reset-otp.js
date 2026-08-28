const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined
    })
  });
}

const db = admin.firestore();

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { email, otp } = JSON.parse(event.body || '{}');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const submittedOtp = String(otp || '').trim();

    if (!normalizedEmail || !/^\d{6}$/.test(submittedOtp)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Enter the 6-digit reset code.' }) };
    }

    const snapshot = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .get();

    if (snapshot.empty) {
      return { statusCode: 400, body: JSON.stringify({ error: 'The reset code is invalid or has expired.' }) };
    }

    // Prefer the verified account document if more than one record exists.
    let targetDoc = snapshot.docs.find(d => d.data().isVerified !== false && d.data().resetOtp);
    if (!targetDoc) targetDoc = snapshot.docs.find(d => d.data().resetOtp);
    if (!targetDoc) {
      return { statusCode: 400, body: JSON.stringify({ error: 'The reset code is invalid or has expired.' }) };
    }

    const data = targetDoc.data();
    const storedOtp = String(data.resetOtp || '').trim();
    const expires = Number(data.resetOtpExpires || 0);

    if (!storedOtp || storedOtp !== submittedOtp || !expires || Date.now() > expires) {
      return { statusCode: 400, body: JSON.stringify({ error: 'The reset code is invalid or has expired.' }) };
    }

    // Issue a short-lived, single-purpose token. The token is only useful
    // against update-password.js and is stored server-side as a hash.
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpires = Date.now() + 10 * 60 * 1000;

    await targetDoc.ref.update({
      resetOtp: null,
      resetOtpExpires: null,
      resetVerifiedTokenHash: resetTokenHash,
      resetVerifiedTokenExpires: resetTokenExpires
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        resetToken,
        message: 'Reset code verified successfully.'
      })
    };
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unable to verify the reset code. Please try again.' })
    };
  }
};
