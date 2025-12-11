require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
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

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Payment Backend API',
      version: '1.0.0',
      description: 'A comprehensive payment processing backend API with support for multiple payment gateways including UPI Gateway and Easebuzz. This API provides authentication, payment processing, user management, and administrative dashboard functionality.',
      contact: {
        name: 'API Support'
      },
      license: {
        name: 'MIT'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}/api`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
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
            transactionCount: { type: 'integer', nullable: true, minimum: 0 },
            transactionLimit: { type: 'integer', nullable: true, minimum: 0 },
            allowedGateways: { 
              type: 'array', 
              items: { type: 'string', enum: ['easebuzz', 'upigateway'] },
              description: 'Array of allowed payment gateways for this user'
            },
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
            paymentGateway: { type: 'string', enum: ['easebuzz', 'upigateway', null] },
            transactionCount: { 
              type: ['integer', 'null'], 
              minimum: 0, 
              nullable: true,
              description: 'Transaction count. Must be provided with transactionLimit (one must have a value, the other must be null)' 
            },
            transactionLimit: { 
              type: ['integer', 'null'], 
              minimum: 0, 
              nullable: true,
              description: 'Transaction limit. Must be provided with transactionCount (one must have a value, the other must be null)' 
            },
            allowedGateways: {
              type: 'array',
              items: { type: 'string', enum: ['easebuzz', 'upigateway'] },
              description: 'Array of allowed payment gateways for this user',
              example: ['easebuzz']
            }
          },
          example: {
            username: 'nitinM',
            email: 'nitin@gmail.com',
            password: 'Nitin123',
            isAdmin: false,
            transactionLimit: 100,
            transactionCount: null,
            allowedGateways: ['easebuzz']
          },
          description: 'Both transactionCount and transactionLimit should be included in the payload. One must have a value (non-negative integer) and the other must be null. Both cannot have values, and both cannot be null.'
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

// Payment success/failure redirect handlers (root level for gateway redirects)
const Transaction = require('./models/Transaction');
const paymentService = require('./services/paymentService');

app.get('/success', async (req, res) => {
  try {
    const query = req.query;
    const { client_txn_id, txn_id, status, txnid, hash } = query;

    // Determine which gateway based on parameters
    // UPI Gateway uses: client_txn_id, txn_id
    // Easebuzz uses: txnid, status, hash
    let transaction = null;
    let gateway = null;
    let transactionId = null;

    if (txnid) {
      // Easebuzz redirect
      gateway = 'easebuzz';
      transactionId = txnid;
      
      // Find transaction by txnid
      transaction = await Transaction.findOne({ 
        transactionId: txnid 
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
          gateway: 'easebuzz'
        });
      }

      // Verify hash if provided (Easebuzz security)
      if (hash && transaction.gateway === 'easebuzz') {
        try {
          const callbackResult = paymentService.getGateway('easebuzz').handleCallback(query);
          if (!callbackResult.success) {
            return res.status(400).json({
              success: false,
              message: callbackResult.error || 'Hash verification failed',
              gateway: 'easebuzz'
            });
          }
        } catch (hashError) {
          console.error('Easebuzz hash verification error:', hashError);
          // Continue processing even if hash verification fails (for development)
          // In production, you might want to reject invalid hashes
        }
      }

      // Update transaction status based on Easebuzz status
      const paymentStatus = status || 'success';
      let newStatus = 'pending';
      
      if (paymentStatus === 'success') {
        newStatus = 'success';
      } else if (paymentStatus === 'failed' || paymentStatus === 'failure') {
        newStatus = 'failed';
      }

      // Update transaction if status changed
      if (transaction.status !== newStatus) {
        transaction.status = newStatus;
        transaction.paymentResponse = {
          ...transaction.paymentResponse,
          ...query,
          redirect_date: new Date().toISOString()
        };
        transaction.updatedAt = new Date();
        await transaction.save();
      }

    } else if (client_txn_id) {
      // UPI Gateway redirect
      gateway = 'upigateway';
      transactionId = client_txn_id;
      
      // Find transaction by client_txn_id
      transaction = await Transaction.findOne({ 
        transactionId: client_txn_id 
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
          gateway: 'upigateway'
        });
      }

      // Update transaction status based on query parameters
      const paymentStatus = status || 'success';
      let newStatus = 'pending';
      
      if (paymentStatus === 'success' || paymentStatus === 'completed' || paymentStatus === 'paid') {
        newStatus = 'success';
      } else if (paymentStatus === 'failed' || paymentStatus === 'failure') {
        newStatus = 'failed';
      }

      // Update transaction if status changed
      if (transaction.status !== newStatus) {
        transaction.status = newStatus;
        if (txn_id) {
          transaction.gatewayTransactionId = txn_id;
        }
        transaction.paymentResponse = {
          ...transaction.paymentResponse,
          client_txn_id,
          txn_id,
          status: paymentStatus,
          redirect_date: new Date().toISOString()
        };
        transaction.updatedAt = new Date();
        await transaction.save();
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: client_txn_id (UPI Gateway) or txnid (Easebuzz)'
      });
    }

    // Return success response
    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        gateway: transaction.gateway || gateway,
        gatewayTransactionId: transaction.gatewayTransactionId || txn_id || txnid,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });
  } catch (error) {
    console.error('Payment success handler error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process payment success'
    });
  }
});

// Payment failure redirect handler (root level for gateway redirects)
app.get('/failure', async (req, res) => {
  try {
    const query = req.query;
    const { client_txn_id, txn_id, txnid, status } = query;

    let transaction = null;
    let gateway = null;

    if (txnid) {
      // Easebuzz redirect
      gateway = 'easebuzz';
      transaction = await Transaction.findOne({ transactionId: txnid });
    } else if (client_txn_id) {
      // UPI Gateway redirect
      gateway = 'upigateway';
      transaction = await Transaction.findOne({ transactionId: client_txn_id });
    }

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
        gateway: gateway || 'unknown'
      });
    }

    // Update transaction status to failed
    if (transaction.status !== 'failed') {
      transaction.status = 'failed';
      if (txn_id || txnid) {
        transaction.gatewayTransactionId = txn_id || txnid;
      }
      transaction.paymentResponse = {
        ...transaction.paymentResponse,
        ...query,
        redirect_date: new Date().toISOString()
      };
      transaction.updatedAt = new Date();
      await transaction.save();
    }

    res.json({
      success: false,
      message: 'Payment failed',
      data: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        gateway: transaction.gateway || gateway,
        gatewayTransactionId: transaction.gatewayTransactionId || txn_id || txnid
      }
    });
  } catch (error) {
    console.error('Payment failure handler error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process payment failure'
    });
  }
});

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

// Database connection and server startup
async function startServer() {
  try {
    // Database connection - Connect to MongoDB
    if (!process.env.SKIP_DB_CONNECTION) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/payment-backend';
      
      console.log('🔄 Connecting to MongoDB...');
      console.log(`📍 Connection URI: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
      
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 10000
      });
      
      console.log('✅ MongoDB connected successfully!');
      console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);
      console.log(`🌐 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
      console.log('💾 Data will be saved to MongoDB\n');
    }

    // Start the server only after MongoDB is connected
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('\n❌ MongoDB connection error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('1. Make sure MongoDB service is running');
    console.error('   - Windows: Check Services (services.msc) for "MongoDB" service');
    console.error('   - Or run: mongod --dbpath "C:\\data\\db" (if not running as service)');
    console.error('2. Verify MongoDB is listening on port 27017');
    console.error('3. Check your .env file has correct MONGODB_URI');
    console.error(`   Current URI: ${process.env.MONGODB_URI || 'mongodb://localhost:27017/payment-backend'}\n`);
    
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ MongoDB connection failed in production mode. Please ensure MongoDB is running.');
      process.exit(1);
    } else {
      console.error('❌ Failed to start server. Please start MongoDB and try again.');
      process.exit(1);
    }
  }
}

// Start the server
startServer();

module.exports = app;

