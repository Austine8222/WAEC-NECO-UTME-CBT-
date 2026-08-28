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
const auth = admin.auth();

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { email, newPassword, resetToken } = JSON.parse(event.body || '{}');
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !newPassword || !resetToken) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Please verify the reset code before choosing a new password.' }) };
    }

    if (String(newPassword).length < 6) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Password must be at least 6 characters long.' }) };
    }

    const tokenHash = crypto.createHash('sha256').update(String(resetToken)).digest('hex');
    const snapshot = await db.collection('users')
      .where('email', '==', normalizedEmail)
      .get();

    if (snapshot.empty) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User account not found.' }) };
    }

    const target = snapshot.docs.find(doc => {
      const d = doc.data();
      return d.resetVerifiedTokenHash === tokenHash &&
        Number(d.resetVerifiedTokenExpires || 0) > Date.now();
    });

    if (!target) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Your reset session has expired. Please request a new code.' }) };
    }

    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(normalizedEmail);
    } catch (_) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User account not found.' }) };
    }

    await auth.updateUser(userRecord.uid, { password: String(newPassword) });

    // Consume the reset token so it cannot be reused.
    await target.ref.update({
      resetVerifiedTokenHash: null,
      resetVerifiedTokenExpires: null
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, message: 'Password updated successfully.' })
    };
  } catch (error) {
    console.error('Update password error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Password could not be updated. Please try again.' })
    };
  }
};
