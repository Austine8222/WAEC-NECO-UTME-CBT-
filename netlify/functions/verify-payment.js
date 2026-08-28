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

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { reference, userId, unlockType } = JSON.parse(event.body || '{}');
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Authentication required.' }) };
    }
    const decoded = await auth.verifyIdToken(authHeader.slice(7));
    if (decoded.uid !== userId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Authenticated account does not match the payment account.' }) };
    }
    const allowedSubjects = [
      'english', 'mathematics', 'biology', 'chemistry', 'physics', 'government',
      'economics', 'commerce', 'crk', 'irk', 'accounting', 'geography',
      'agricultural-science', 'literature', 'civiceducation'
    ];

    if (!reference || !userId || !unlockType) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required payment details.' }) };
    }
    if (unlockType !== 'all' && !allowedSubjects.includes(unlockType)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid subject unlock request.' }) };
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'PAYSTACK_SECRET_KEY is not configured on the server.' }) };
    }

    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json'
      }
    });
    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status || !paystackData.data) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Transaction verification failed.' }) };
    }
    if (paystackData.data.status !== 'success') {
      return { statusCode: 202, body: JSON.stringify({ success: false, pending: true, status: paystackData.data.status }) };
    }

    const expectedAmount = unlockType === 'all' ? 200000 : 50000;
    const amountPaid = Number(paystackData.data.amount);
    const currency = String(paystackData.data.currency || '').toUpperCase();
    const paidEmail = String(paystackData.data.customer?.email || '').toLowerCase();

    if (currency !== 'NGN' || amountPaid < expectedAmount) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Payment amount or currency does not match the requested package.' }) };
    }

    const metadata = paystackData.data.metadata || {};
    const customFields = Array.isArray(metadata.custom_fields) ? metadata.custom_fields : [];
    const field = (name) => customFields.find(f => f && f.variable_name === name)?.value;
    const metadataUserId = field('user_id');
    const metadataUnlock = field('unlock_type');

    if (metadataUserId && metadataUserId !== userId) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Payment does not belong to this account.' }) };
    }
    if (metadataUnlock && metadataUnlock !== (unlockType === 'all' ? 'ALL_SUBJECTS' : unlockType)) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Payment package does not match the requested unlock.' }) };
    }

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Candidate account was not found.' }) };
    }

    const userData = userSnap.data();
    if (userData.email && paidEmail && userData.email.toLowerCase() !== paidEmail) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Payment email does not match the candidate account.' }) };
    }

    const ALL_SUBJECTS = allowedSubjects;
    const existing = Array.isArray(userData.unlockedSubjects) ? userData.unlockedSubjects : ['english', 'mathematics'];
    const updated = unlockType === 'all'
      ? ALL_SUBJECTS
      : Array.from(new Set([...existing, unlockType]));

    await userRef.update({
      unlockedSubjects: updated,
      isAllUnlocked: unlockType === 'all' ? true : Boolean(userData.isAllUnlocked),
      lastPaymentReference: reference,
      lastPaymentAmount: amountPaid,
      lastPaymentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Keep an auditable payment record and make duplicate callbacks harmless.
    await db.collection('payments').doc(reference).set({
      reference,
      userId,
      email: paidEmail || userData.email || null,
      unlockType,
      amount: amountPaid,
      currency,
      status: 'success',
      paidAt: paystackData.data.paid_at || null,
      recordedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, unlockedSubjects: updated, isAllUnlocked: unlockType === 'all' ? true : Boolean(userData.isAllUnlocked) })
    };
  } catch (error) {
    console.error('Payment verification error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error during payment verification.' }) };
  }
};
