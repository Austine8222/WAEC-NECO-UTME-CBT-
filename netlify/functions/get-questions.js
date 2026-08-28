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

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const params = event.queryStringParameters || {};
    const subject = String(params.subject || '').trim().toLowerCase();
    const examType = String(params.type || 'wassce').trim().toLowerCase();
    const requestedLimit = Math.min(Math.max(parseInt(params.limit || '20', 10), 1), 40);

    if (!subject) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Subject is required.' }) };
    }

    let snapshot;
    try {
      snapshot = await db.collection('questions')
        .where('subject', '==', subject)
        .where('examType', '==', examType)
        .limit(100)
        .get();
    } catch (queryError) {
      // Allows older seeded documents that do not yet have examType.
      snapshot = await db.collection('questions')
        .where('subject', '==', subject)
        .limit(100)
        .get();
    }

    const bank = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(q => q.active !== false && q.question && Array.isArray(q.options) && q.options.length >= 4 && Number.isInteger(q.correctAnswer));

    if (!bank.length) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ error: `No questions are currently available for ${subject}.` })
      };
    }

    // Shuffle server-side so candidates do not always receive the same order.
    for (let i = bank.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }

    const questions = bank.slice(0, Math.min(requestedLimit, bank.length));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: true, count: questions.length, data: questions })
    };
  } catch (error) {
    console.error('Firestore question retrieval error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unable to load questions from the production question bank.' })
    };
  }
};
