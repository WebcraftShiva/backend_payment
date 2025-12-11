require('dotenv').config();
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

async function connectToMongoDB() {
  try {
    // Try to connect to the MongoDB URI from .env
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/payment-backend';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ Connected to MongoDB:', mongoUri);
    return true;
  } catch (error) {
    // If connection fails, use in-memory MongoDB
    console.log('⚠️  Local MongoDB not available, using in-memory MongoDB...');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    console.log('✅ In-memory MongoDB started at:', mongoUri);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    // Update environment variable for server
    process.env.MONGODB_URI = mongoUri;
    console.log('✅ Connected to in-memory MongoDB');
    return true;
  }
}

const seedData = async () => {
  try {
    // Connect to MongoDB
    await connectToMongoDB();
    console.log('Connected to MongoDB\n');

    const User = require('../models/User');
    const PaymentMethod = require('../models/PaymentMethod');
    const Setting = require('../models/Setting');

    // Create default admin user
    const adminExists = await User.findOne({ isAdmin: true });
    if (!adminExists) {
      const admin = new User({
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123', // Change this in production!
        isAdmin: true,
        isActive: true
      });
      await admin.save();
      console.log('✅ Default admin user created:');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   ⚠️  Please change the default password after first login!\n');
    } else {
      console.log('ℹ️  Admin user already exists\n');
    }

    // Create payment methods
    const paymentMethods = [
      {
        name: 'Easebuzz Payment',
        code: 'EASEBUZZ',
        gateway: 'easebuzz',
        isActive: true
      },
      {
        name: 'UPI Gateway Payment',
        code: 'UPIGATEWAY',
        gateway: 'upigateway',
        isActive: true
      }
    ];

    for (const method of paymentMethods) {
      const existing = await PaymentMethod.findOne({ code: method.code });
      if (!existing) {
        await PaymentMethod.create(method);
        console.log(`✅ Created payment method: ${method.name}`);
      } else {
        console.log(`ℹ️  Payment method ${method.name} already exists`);
      }
    }
    console.log('');

    // Create default settings
    const defaultSettings = [
      {
        key: 'rateLimiting',
        value: {
          enabled: true,
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 100 // requests per window
        },
        description: 'Rate limiting configuration'
      }
    ];

    for (const setting of defaultSettings) {
      const existing = await Setting.findOne({ key: setting.key });
      if (!existing) {
        await Setting.create(setting);
        console.log(`✅ Created setting: ${setting.key}`);
      } else {
        console.log(`ℹ️  Setting ${setting.key} already exists`);
      }
    }

    console.log('\n✅ Seed data created successfully!');
    console.log(`💡 MongoDB URI: ${process.env.MONGODB_URI}`);
    console.log('🚀 You can now start the server with: npm run dev\n');
    
    // Don't disconnect - keep connection alive for server
    // process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
    process.exit(1);
  }
};

seedData();

