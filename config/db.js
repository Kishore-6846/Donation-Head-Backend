const mongoose = require('mongoose');

// Never buffer commands if connection is not established or reconnecting
mongoose.set('bufferCommands', false);
// Disable automatic index build on production connections to prevent startup latency
mongoose.set('autoIndex', false);

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
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 15000,
      connectTimeoutMS: 10000,
      maxPoolSize: 30,
      minPoolSize: 5,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      w: 'majority'
    });
    isConnected = true;
    console.log(`✅ MongoDB Connected successfully: ${conn.connection.host} (${conn.connection.name})`);
    return true;
  } catch (error) {
    console.error(`⚠️ MongoDB Connection Error: ${error.message}`);
    console.log('⚡ Falling back to in-memory store so app remains functional.');
    return false;
  }
};

const getIsConnected = () => {
  return mongoose.connection && mongoose.connection.readyState === 1;
};

module.exports = { connectDB, getIsConnected };

