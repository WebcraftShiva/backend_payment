require('dotenv').config();
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { spawn } = require('child_process');

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
    return mongoUri;
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
    
    // Update environment variable
    process.env.MONGODB_URI = mongoUri;
    console.log('✅ Connected to in-memory MongoDB');
    return mongoUri;
  }
}

async function seedDatabase() {
  console.log('\n📦 Seeding database...\n');
  
  const User = require('./models/User');
  const PaymentMethod = require('./models/PaymentMethod');
  const Setting = require('./models/Setting');

  try {
    // Create default admin user
    const adminExists = await User.findOne({ isAdmin: true });
    if (!adminExists) {
      const admin = new User({
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        isAdmin: true,
        isActive: true
      });
      await admin.save();
      console.log('✅ Default admin user created:');
      console.log('   Username: admin');
      console.log('   Password: admin123');
      console.log('   ⚠️  Please change the default password after first login!');
    } else {
      console.log('ℹ️  Admin user already exists');
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

    // Create default settings
    const defaultSettings = [
      {
        key: 'rateLimiting',
        value: {
          enabled: true,
          windowMs: 15 * 60 * 1000,
          max: 100
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

    console.log('\n✅ Database seeded successfully!\n');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

async function startServer() {
  try {
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Seed database
    await seedDatabase();
    
    // Set flag to skip DB connection in server.js
    process.env.SKIP_DB_CONNECTION = 'true';
    
    // Load and start the Express server
    const express = require('express');
    const cors = require('cors');
    const helmet = require('helmet');
    const morgan = require('morgan');
    const swaggerUi = require('swagger-ui-express');
    const swaggerJsdoc = require('swagger-jsdoc');

    const authRoutes = require('./routes/auth');
    const paymentRoutes = require('./routes/payments');
    const paymentMethodRoutes = require('./routes/paymentMethods');
    const userRoutes = require('./routes/users');
    const dashboardRoutes = require('./routes/dashboard');
    const settingsRoutes = require('./routes/settings');

    const app = express();
    const PORT = process.env.PORT || 9000;

    // Swagger configuration - use simplified version for now
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'Payment Backend API',
          version: '1.0.0',
          description: 'A comprehensive payment processing backend API with support for multiple payment gateways including UPI Gateway and Easebuzz.',
          contact: { name: 'API Support' },
          license: { name: 'MIT' }
        },
        servers: [{ url: `http://localhost:${PORT}/api`, description: 'Development server' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
          },
          schemas: {
            User: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                email: { type: 'string', format: 'email' },
                isAdmin: { type: 'boolean' },
                isActive: { type: 'boolean' },
                paymentGateway: { type: 'string', enum: ['easebuzz', 'upigateway', null] },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            LoginRequest: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string' },
                password: { type: 'string' }
              }
            },
            LoginResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' }
                  }
                }
              }
            },
            CreateUserRequest: {
              type: 'object',
              required: ['username', 'email', 'password'],
              properties: {
                username: { type: 'string' },
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 6 },
                isAdmin: { type: 'boolean' },
                paymentGateway: { type: 'string', enum: ['easebuzz', 'upigateway', null] }
              }
            },
            PaymentRequest: {
              type: 'object',
              required: ['amount', 'email'],
              properties: {
                amount: { type: 'number', minimum: 0.01 },
                email: { type: 'string', format: 'email' },
                firstName: { type: 'string' },
                phone: { type: 'string' },
                productInfo: { type: 'string' },
                gateway: { type: 'string', enum: ['easebuzz', 'upigateway'] },
                returnUrl: { type: 'string', format: 'uri' },
                callbackUrl: { type: 'string', format: 'uri' },
                currency: { type: 'string', default: 'INR' }
              }
            },
            PaymentResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: {
                  type: 'object',
                  properties: {
                    transactionId: { type: 'string' },
                    paymentLink: { type: 'string', format: 'uri' },
                    gateway: { type: 'string' }
                  }
                }
              }
            },
            PaymentStatusRequest: {
              type: 'object',
              required: ['transactionId'],
              properties: {
                transactionId: { type: 'string' }
              }
            },
            PaymentStatusResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: {
                    transactionId: { type: 'string' },
                    status: { type: 'string', enum: ['pending', 'success', 'failed', 'cancelled'] },
                    amount: { type: 'number' },
                    currency: { type: 'string' },
                    gateway: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            },
            Transaction: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                userId: { type: 'string' },
                paymentMethodId: { type: 'string' },
                gateway: { type: 'string', enum: ['easebuzz', 'upigateway'] },
                amount: { type: 'number' },
                currency: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'success', 'failed', 'cancelled'] },
                transactionId: { type: 'string' },
                gatewayTransactionId: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            PaymentMethod: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                code: { type: 'string' },
                gateway: { type: 'string', enum: ['easebuzz', 'upigateway'] },
                isActive: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            DashboardStats: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: {
                  type: 'object',
                  properties: {
                    users: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        active: { type: 'integer' },
                        inactive: { type: 'integer' }
                      }
                    },
                    transactions: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        successful: { type: 'integer' },
                        pending: { type: 'integer' },
                        failed: { type: 'integer' }
                      }
                    },
                    revenue: {
                      type: 'object',
                      properties: {
                        total: { type: 'number' },
                        average: { type: 'number' }
                      }
                    }
                  }
                }
              }
            },
            SuccessResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: { type: 'object' }
              }
            },
            ErrorResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean', default: false },
                message: { type: 'string' },
                errors: { type: 'array', items: { type: 'object' } }
              }
            },
            PaginatedResponse: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                data: { type: 'array' },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                    pages: { type: 'integer' }
                  }
                }
              }
            },
            Setting: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                value: { type: 'object' },
                description: { type: 'string' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            QueueStatus: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        }
      },
      apis: ['./routes/*.js', './models/*.js']
    };

    const swaggerSpec = swaggerJsdoc(swaggerOptions);

    // Middleware
    app.use(helmet());
    app.use(cors());
    app.use(morgan('combined'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Swagger documentation
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/payment-methods', paymentMethodRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/settings', settingsRoutes);

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    });

    app.listen(PORT, () => {
      console.log('═══════════════════════════════════════════════════════');
      console.log('🚀 Payment Backend API Server Started');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`📍 Server running on: http://localhost:${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log(`💾 Database: ${mongoServer ? 'In-Memory MongoDB' : 'Local MongoDB'}`);
      console.log(`🔐 Default Admin: admin / admin123`);
      console.log('═══════════════════════════════════════════════════════\n');
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      await mongoose.disconnect();
      if (mongoServer) {
        await mongoServer.stop();
      }
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
    process.exit(1);
  }
}

startServer();

