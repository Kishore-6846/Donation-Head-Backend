const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function inspect() {
  const uri = process.env.MONGODB_URI;
  console.log('Connecting to Mongo URI...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected!');
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));

  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`Collection [${c.name}] document count: ${count}`);
    if (count > 0 && count <= 5) {
      const docs = await db.collection(c.name).find().toArray();
      console.log(`Docs in [${c.name}]:`, JSON.stringify(docs, null, 2));
    }
  }
  await mongoose.disconnect();
  console.log('Done!');
}

inspect().catch(err => {
  console.error('Inspect error:', err);
  process.exit(1);
});
