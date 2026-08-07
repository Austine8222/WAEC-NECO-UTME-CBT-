const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Handle escaped newlines in private keys stored in environment variables
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
    const { email, password, name, otp } = JSON.parse(event.body);

    if (!email || !password || !name || !otp) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    // 1. Check if an unverified user record exists in Firestore holding this OTP
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).where('isVerified', '==', false).get();

    if (snapshot.empty) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No pending registration found or already verified.' }) };
    }

    let userDocData = null;
    let docId = null;
    snapshot.forEach(doc => {
      docId = doc.id;
      userDocData = doc.data();
    });

    // 2. Validate OTP and check expiration (e.g., 10 minutes window)
    if (!userDocData.otp || userDocData.otp !== otp) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid verification code.' }) };
    }

    const now = Date.now();
    if (userDocData.otpExpires && now > userDocData.otpExpires) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Verification code has expired. Please register again.' }) };
    }

    // 3. Create the user in Firebase Auth securely using Admin SDK
    let userRecord;
    try {
      userRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: name
      });
    } catch (authErr) {
      return { statusCode: 400, body: JSON.stringify({ error: authErr.message }) };
    }

    // 4. Update Firestore document with correct UID and mark as verified
    await db.collection('users').doc(userRecord.uid).set({
      name: name,
      email: email,
      isVerified: true,
      otp: null,
      otpExpires: null,
      unlockedSubjects: ['english', 'mathematics'],
      isAllUnlocked: false,
      createdAt: userDocData.createdAt || new Date().toISOString()
    });

    // Clean up temporary pre-auth doc if it had a different auto-id
    if (docId !== userRecord.uid) {
      await db.collection('users').doc(docId).delete();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Account verified and created successfully.' })
    };

  } catch (error) {
    console.error('Verify & Register Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
