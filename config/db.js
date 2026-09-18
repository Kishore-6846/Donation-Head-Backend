const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    console.log('---------------------------------------------------------');
    console.log('ℹ️  MongoDB URI is not set in backend/.env.');
    console.log('⚡ Running with in-memory fallback store so all APIs work.');
    console.log('   Add your MongoDB URI to backend/.env when ready!');
    console.log('---------------------------------------------------------');
    return false;
  }

  try {
    const conn = await mongoose.connect(uri);
    isConnected = true;
    console.log(`✅ MongoDB Connected successfully: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`⚠️ MongoDB Connection Error: ${error.message}`);
    console.log('⚡ Falling back to in-memory store so app remains functional.');
    return false;
  }
};

const getIsConnected = () => isConnected;

module.exports = { connectDB, getIsConnected };
