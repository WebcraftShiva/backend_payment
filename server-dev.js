require('dotenv').config();
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Start in-memory MongoDB server for development
let mongoServer;

async function startInMemoryMongoDB() {
  try {
    console.log('🚀 Starting in-memory MongoDB server for development...');
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    console.log('✅ In-memory MongoDB started at:', mongoUri);
    
    // Update environment variable
    process.env.MONGODB_URI = mongoUri;
    
    return mongoUri;
  } catch (error) {
    console.error('❌ Failed to start in-memory MongoDB:', error);
    throw error;
  }
}

async function connectToMongoDB() {
  try {
    // Try to connect to the MongoDB URI from .env
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/payment-backend';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (error) {
    // If connection fails and we're in development, use in-memory MongoDB
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      console.log('⚠️  Local MongoDB not available, using in-memory MongoDB for development...');
      const mongoUri = await startInMemoryMongoDB();
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('✅ Connected to in-memory MongoDB');
      return true;
    } else {
      throw error;
    }
  }
}

// Start the application
async function startServer() {
  try {
    // Connect to MongoDB (or start in-memory)
    await connectToMongoDB();
    
    // Set flag to skip DB connection in server.js
    process.env.SKIP_DB_CONNECTION = 'true';
    
    // Now load and start the Express server
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

    // Swagger configuration (same as server.js)
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'Payment Backend API',
          version: '1.0.0',
          description: 'A comprehensive payment processing backend API with support for multiple payment gateways including UPI Gateway and Easebuzz. This API provides authentication, payment processing, user management, and administrative dashboard functionality.',
          contact: { name: 'API Support' },
          license: { name: 'MIT' }
        },
        servers: [{ url: `http://localhost:${PORT}/api`, description: 'Development server' }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
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
      console.log(`\n🚀 Server is running on port ${PORT}`);
      console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
      console.log(`💡 Using ${mongoServer ? 'in-memory' : 'local'} MongoDB for development\n`);
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
    process.exit(1);
  }
}

startServer();

