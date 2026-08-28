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
const allowedSubjects = [
  'english', 'mathematics', 'biology', 'chemistry', 'physics', 'government',
  'economics', 'commerce', 'crk', 'irk', 'accounting', 'geography',
  'agricultural-science', 'literature', 'civiceducation'
];

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required.' }) };
    const decoded = await auth.verifyIdToken(authHeader.slice(7));
    const { unlockType } = JSON.parse(event.body || '{}');

    if (unlockType !== 'all' && !allowedSubjects.includes(unlockType)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid subject package.' }) };
    }
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    if (!userSnap.exists) return { statusCode: 404, body: JSON.stringify({ error: 'Candidate profile not found.' }) };

    const amount = unlockType === 'all' ? 200000 : 50000;
    const customUnlock = unlockType === 'all' ? 'ALL_SUBJECTS' : unlockType;
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        email: decoded.email,
        amount,
        currency: 'NGN',
        metadata: {
          user_id: decoded.uid,
          unlock_type: customUnlock,
          product: 'WAEC_NECO_UTME_CBT_SUBJECT_UNLOCK'
        }
      })
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data?.access_code || !data.data?.reference) {
      console.error('Paystack initialization failed:', data);
      return { statusCode: 502, body: JSON.stringify({ error: 'Unable to initialize Paystack payment.' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, accessCode: data.data.access_code, reference: data.data.reference })
    };
  } catch (error) {
    console.error('Initialize payment error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Unable to initialize payment.' }) };
  }
};
