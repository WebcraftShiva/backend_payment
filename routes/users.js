const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { dynamicRateLimiter } = require('../middleware/rateLimiter');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentMethod = require('../models/PaymentMethod');

const router = express.Router();

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

/**
 * @swagger
 * /users/payment-methods:
 *   get:
 *     summary: Get all payment methods (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payment methods
 */
router.get('/payment-methods', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find()
      .sort({ name: 1 });

    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods'
    });
  }
});

/**
 * @swagger
 * /users/{userId}:
 *   get:
 *     summary: Get a single user by ID (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 */
router.get('/:userId', authenticate, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post('/', authenticate, isAdmin, [
  body('username').notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('transactionCount').optional({ nullable: true, checkFalsy: false }).custom((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
      throw new Error('Transaction count must be a non-negative integer or null');
    }
    return true;
  }),
  body('transactionLimit').optional({ nullable: true, checkFalsy: false }).custom((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
      throw new Error('Transaction limit must be a non-negative integer or null');
    }
    return true;
  }),
  body('allowedGateways').optional().isArray({ min: 0 }).withMessage('allowedGateways must be an array'),
  body('allowedGateways.*').isIn(['easebuzz', 'upigateway']).withMessage('Each gateway in allowedGateways must be either "easebuzz" or "upigateway"')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const { username, email, password, isAdmin: adminFlag, paymentGateway, transactionCount, transactionLimit, allowedGateways } = req.body;

    // Validate transactionCount and transactionLimit
    // Both can be in payload, but one must be null and the other must have a value
    const hasTransactionCount = transactionCount !== null && transactionCount !== undefined;
    const hasTransactionLimit = transactionLimit !== null && transactionLimit !== undefined;

    // Check if both have values (not allowed)
    if (hasTransactionCount && hasTransactionLimit) {
      return res.status(400).json({
        success: false,
        message: 'Cannot set both transactionCount and transactionLimit. One must be null.'
      });
    }

    // Check if both are null or undefined (at least one should have a value)
    if (!hasTransactionCount && !hasTransactionLimit) {
      return res.status(400).json({
        success: false,
        message: 'Either transactionCount or transactionLimit must be provided with a value (the other should be null).'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this username or email already exists'
      });
    }

    const userData = {
      username,
      email,
      password,
      isAdmin: adminFlag || false,
      paymentGateway: paymentGateway || null,
      allowedGateways: Array.isArray(allowedGateways) ? allowedGateways : []
    };

    // Set transactionCount and transactionLimit based on what's provided
    // One will have a value, the other will be null
    if (hasTransactionCount) {
      userData.transactionCount = transactionCount;
      userData.transactionLimit = null;
    } else {
      userData.transactionLimit = transactionLimit;
      userData.transactionCount = null;
    }

    const user = new User(userData);

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        paymentGateway: user.paymentGateway,
        transactionCount: user.transactionCount,
        transactionLimit: user.transactionLimit,
        allowedGateways: user.allowedGateways || []
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create user'
    });
  }
});

/**
 * @swagger
 * /users/{userId}:
 *   put:
 *     summary: Update a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               isAdmin:
 *                 type: boolean
 *               isActive:
 *                 type: boolean
 *               paymentGateway:
 *                 type: string
 *                 enum: [easebuzz, upigateway, null]
 *               transactionCount:
 *                 type: ['integer', 'null']
 *                 minimum: 0
 *                 nullable: true
 *                 description: Transaction count. Must be provided with transactionLimit (one must have a value, the other must be null)
 *               transactionLimit:
 *                 type: ['integer', 'null']
 *                 minimum: 0
 *                 nullable: true
 *                 description: Transaction limit. Must be provided with transactionCount (one must have a value, the other must be null)
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: User not found
 */
router.put('/:userId', authenticate, isAdmin, [
  body('username').optional().notEmpty().withMessage('Username cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('isAdmin').optional().isBoolean().withMessage('isAdmin must be a boolean'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('paymentGateway').optional().isIn(['easebuzz', 'upigateway', null]).withMessage('Invalid payment gateway'),
  body('transactionCount').optional({ nullable: true, checkFalsy: false }).custom((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
      throw new Error('Transaction count must be a non-negative integer or null');
    }
    return true;
  }),
  body('transactionLimit').optional({ nullable: true, checkFalsy: false }).custom((value) => {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
      throw new Error('Transaction limit must be a non-negative integer or null');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { username, email, isAdmin: adminFlag, isActive, paymentGateway, transactionCount, transactionLimit } = req.body;

    // Validate transactionCount and transactionLimit if provided
    const hasTransactionCount = transactionCount !== null && transactionCount !== undefined;
    const hasTransactionLimit = transactionLimit !== null && transactionLimit !== undefined;

    if (hasTransactionCount && hasTransactionLimit) {
      return res.status(400).json({
        success: false,
        message: 'Cannot set both transactionCount and transactionLimit. Please provide only one.'
      });
    }

    // Update user fields
    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUser = await User.findOne({ username, _id: { $ne: req.params.userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username already taken'
        });
      }
      user.username = username;
    }

    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ email, _id: { $ne: req.params.userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already taken'
        });
      }
      user.email = email;
    }

    if (adminFlag !== undefined) user.isAdmin = adminFlag;
    if (isActive !== undefined) user.isActive = isActive;
    if (paymentGateway !== undefined) user.paymentGateway = paymentGateway || null;

    // Handle transactionCount and transactionLimit
    if (hasTransactionCount) {
      user.transactionCount = transactionCount;
      user.transactionLimit = null;
    } else if (hasTransactionLimit) {
      user.transactionLimit = transactionLimit;
      user.transactionCount = null;
    }

    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        paymentGateway: user.paymentGateway,
        transactionCount: user.transactionCount,
        transactionLimit: user.transactionLimit
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update user'
    });
  }
});

/**
 * @swagger
 * /users/{userId}/transactions:
 *   get:
 *     summary: Get transactions for a specific user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: User transactions
 */
router.get('/:userId/transactions', authenticate, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ userId: req.params.userId })
      .populate('paymentMethodId', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments({ userId: req.params.userId });

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user transactions'
    });
  }
});

/**
 * @swagger
 * /users/{userId}/status:
 *   patch:
 *     summary: Enable or disable a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User status updated
 */
router.patch('/:userId/status', authenticate, isAdmin, [
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = req.body.isActive;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: `User ${req.body.isActive ? 'enabled' : 'disabled'} successfully`,
      data: {
        id: user._id,
        username: user.username,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

/**
 * @swagger
 * /users/{userId}/password:
 *   patch:
 *     summary: Update user password (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password updated
 */
router.patch('/:userId/password', authenticate, isAdmin, [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.password = req.body.password;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password'
    });
  }
});

/**
 * @swagger
 * /users/{userId}/payment-gateway:
 *   patch:
 *     summary: Assign payment gateway to user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentGateway:
 *                 type: string
 *                 enum: [easebuzz, upigateway, null]
 *     responses:
 *       200:
 *         description: Payment gateway assigned
 */
router.patch('/:userId/payment-gateway', authenticate, isAdmin, [
  body('paymentGateway').optional().isIn(['easebuzz', 'upigateway', null]).withMessage('Invalid payment gateway')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.paymentGateway = req.body.paymentGateway || null;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Payment gateway assigned successfully',
      data: {
        id: user._id,
        username: user.username,
        paymentGateway: user.paymentGateway
      }
    });
  } catch (error) {
    console.error('Assign payment gateway error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign payment gateway'
    });
  }
});

module.exports = router;

