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

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  try {
    const subject = String(event.queryStringParameters?.subject || '').trim().toLowerCase();
    if (!subject) return { statusCode: 400, body: JSON.stringify({ error: 'Subject is required.' }) };
    const snap = await admin.firestore().collection('practiceGuides').doc(subject).get();
    if (!snap.exists) return { statusCode: 404, body: JSON.stringify({ error: 'Practice guide not found.' }) };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify({ success: true, guide: snap.data() })
    };
  } catch (error) {
    console.error('Practice guide error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to load practice guide.' }) };
  }
};
