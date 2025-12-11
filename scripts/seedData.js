require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const Setting = require('../models/Setting');

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/payment-backend', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

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
      console.log('Default admin user created:');
      console.log('Username: admin');
      console.log('Password: admin123');
      console.log('⚠️  Please change the default password after first login!');
    } else {
      console.log('Admin user already exists');
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
        console.log(`Created payment method: ${method.name}`);
      } else {
        console.log(`Payment method ${method.name} already exists`);
      }
    }

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
        console.log(`Created setting: ${setting.key}`);
      } else {
        console.log(`Setting ${setting.key} already exists`);
      }
    }

    console.log('\n✅ Seed data created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedData();

