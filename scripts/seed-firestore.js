const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'question-bank.json'), 'utf8'));
const guides = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'practice-guides.json'), 'utf8'));

async function seed() {
  console.log(`Seeding ${questions.length} questions...`);
  let batch = db.batch();
  let operations = 0;
  let written = 0;

  for (const q of questions) {
    const id = `${q.subject}_${q.examType}_${String(written + 1).padStart(4, '0')}`;
    const ref = db.collection('questions').doc(id);
    batch.set(ref, {
      ...q,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    operations++;
    written++;
    if (operations === 450) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  }
  if (operations) await batch.commit();

  console.log(`Seeding ${guides.length} practice guides...`);
  batch = db.batch();
  for (const guide of guides) {
    const ref = db.collection('practiceGuides').doc(guide.id);
    batch.set(ref, {
      title: guide.title,
      introduction: guide.introduction,
      topics: guide.topics,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
  console.log('Firestore seed completed successfully.');
}

seed().catch(error => {
  console.error('Firestore seed failed:', error);
  process.exit(1);
});
