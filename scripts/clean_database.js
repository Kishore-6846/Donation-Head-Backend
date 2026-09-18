const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function cleanDatabase() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected successfully to MongoDB!');

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('\n--- Current Collections & Counts ---');
  for (const c of collections) {
    const count = await mongoose.connection.db.collection(c.name).countDocuments();
    console.log(`Collection: ${c.name}, Documents: ${count}`);
  }

  // Purge dummy collections: donationreceipts, donationheads, employees, notifications, roles
  const dummyCollections = [
    'donationreceipts',
    'donationheads',
    'employees',
    'notifications',
    'roles'
  ];

  for (const colName of dummyCollections) {
    const exists = collections.some(c => c.name === colName);
    if (exists) {
      const res = await mongoose.connection.db.collection(colName).deleteMany({});
      console.log(`Cleared collection '${colName}': deleted ${res.deletedCount} documents.`);
    }
  }

  // Check users collection
  const usersCol = mongoose.connection.db.collection('users');
  const allUsers = await usersCol.find({}).toArray();
  console.log('\n--- Existing Users ---');
  allUsers.forEach(u => {
    console.log(`User ID: ${u._id}, email: ${u.email}, role: ${u.role}, trustName: ${u.trustName}`);
  });

  // Delete all dummy/seed users with 'usr_' id or dummy emails
  const deletedUsers = await usersCol.deleteMany({
    $or: [
      { _id: /^usr_/ },
      { email: /admin@donationreceipt\.in/i },
      { email: /test/i },
      { email: /dummy/i },
      { email: /example\.com/i },
      { email: /smilewelfare\.org/i },
      { email: /karunatrust\.in/i },
      { email: /helpinghandsrural\.org/i },
      { email: /aadhavantrust\.org/i },
      { trustName: /Anbu Suzh Ulagu/i }
    ]
  });
  console.log(`Deleted ${deletedUsers.deletedCount} dummy/test user accounts.`);

  console.log('\n--- Remaining Users in DB ---');
  const remainingUsers = await usersCol.find({}).toArray();
  console.log(remainingUsers.map(u => ({ id: u._id, email: u.email, role: u.role, isSuperAdmin: u.isSuperAdmin })));

  console.log('\nDatabase cleanup complete.');
  await mongoose.disconnect();
}

cleanDatabase().catch(err => {
  console.error('Error cleaning database:', err);
  process.exit(1);
});
