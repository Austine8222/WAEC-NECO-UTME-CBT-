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

const auth = admin.auth();

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { email, newPassword } = JSON.parse(event.body);

    if (!email || !newPassword) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Email and new password are required' }) };
    }

    if (newPassword.length < 6) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Password must be at least 6 characters long' }) };
    }

    // Find user by email in Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (err) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User account not found.' }) };
    }

    // Update password securely via Firebase Admin SDK
    await auth.updateUser(userRecord.uid, {
      password: newPassword
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Password updated successfully.' })
    };

  } catch (error) {
    console.error('Update Password Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
