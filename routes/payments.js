const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { paymentLimiter, dynamicRateLimiter } = require('../middleware/rateLimiter');
const paymentService = require('../services/paymentService');
const Transaction = require('../models/Transaction');

const router = express.Router();

/**
 * @swagger
 * /payments/create-payment:
 *   post:
 *     summary: Create a new payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentRequest'
 *     responses:
 *       200:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentResponse'
 */
router.post('/create-payment', authenticate, paymentLimiter, [
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount is required'),
  // Email validation - accept multiple field names (at least one must be provided)
  body('email').optional().isEmail().withMessage('Valid email is required'),
  body('customerEmail').optional().isEmail().withMessage('Valid email is required'),
  body('customer_email').optional().isEmail().withMessage('Valid email is required'),
  // URL validations - accept multiple field names for both success and failure URLs
  body('successUrl').optional().isURL().withMessage('Valid success URL is required'),
  body('surl').optional().isURL().withMessage('Valid success URL is required'),
  body('returnUrl').optional().isURL().withMessage('Valid return URL is required'),
  body('redirect_url').optional().isURL().withMessage('Valid redirect URL is required'),
  body('failureUrl').optional().isURL().withMessage('Valid failure URL is required'),
  body('furl').optional().isURL().withMessage('Valid failure URL is required'),
  body('failure_redirect_url').optional().isURL().withMessage('Valid failure redirect URL is required'),
  // Gateway selection
  body('gateway').optional().isIn(['easebuzz', 'upigateway']).withMessage('Gateway must be easebuzz or upigateway')
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

    // Validate that at least one email field is provided
    const email = req.body.email || req.body.customerEmail || req.body.customer_email;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: [{ msg: 'Email is required (provide email, customerEmail, or customer_email)' }]
      });
    }

    const paymentData = {
      ...req.body,
      userId: req.user._id
    };

    const result = await paymentService.createPayment(req.user._id, paymentData);

    // Return response in the format expected
    if (result.responseData) {
      // Return in the user's expected format
      res.json(result.responseData);
    } else {
      // Fallback to standard format
      res.json({
        status: result.status !== undefined ? result.status : true,
        data: {
          order_id: result.transactionId,
          payment_url: result.paymentLink
        },
        msg: 'Payment initiated successfully'
      });
    }
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create payment'
    });
  }
});

/**
 * @swagger
 * /payments/payment-status:
 *   post:
 *     summary: Check payment status
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentStatusRequest'
 *     responses:
 *       200:
 *         description: Payment status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentStatusResponse'
 */
router.post('/payment-status', authenticate, [
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('txn_date').optional().isString().withMessage('Transaction date must be a string')
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

    const { transactionId, txn_date } = req.body;

    // Verify transaction belongs to user (unless admin)
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (!req.user.isAdmin && transaction.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const result = await paymentService.checkPaymentStatus(transactionId, txn_date);

    // Populate user and payment method details
    await result.transaction.populate('userId', 'username email');
    await result.transaction.populate('paymentMethodId', 'name code');

    res.json({
      success: true,
      data: {
        transactionId: result.transaction.transactionId,
        gatewayTransactionId: result.transaction.gatewayTransactionId,
        status: result.transaction.status,
        amount: result.transaction.amount,
        currency: result.transaction.currency,
        gateway: result.transaction.gateway,
        userId: result.transaction.userId,
        paymentMethodId: result.transaction.paymentMethodId,
        paymentRequest: result.transaction.paymentRequest ? Object.fromEntries(result.transaction.paymentRequest) : null,
        paymentResponse: result.transaction.paymentResponse ? Object.fromEntries(result.transaction.paymentResponse) : null,
        callbackUrl: result.transaction.callbackUrl,
        returnUrl: result.transaction.returnUrl,
        createdAt: result.transaction.createdAt,
        updatedAt: result.transaction.updatedAt,
        gatewayResponse: result.gatewayResponse
      }
    });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check payment status'
    });
  }
});

/**
 * @swagger
 * /payments/transaction/{transactionId}:
 *   get:
 *     summary: Get transaction details by ID
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.get('/transaction/:transactionId', authenticate, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await Transaction.findOne({ transactionId })
      .populate('userId', 'username email')
      .populate('paymentMethodId', 'name code');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify transaction belongs to user (unless admin)
    if (!req.user.isAdmin && transaction.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: {
        transactionId: transaction.transactionId,
        gatewayTransactionId: transaction.gatewayTransactionId,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        gateway: transaction.gateway,
        userId: transaction.userId,
        paymentMethodId: transaction.paymentMethodId,
        paymentRequest: transaction.paymentRequest ? Object.fromEntries(transaction.paymentRequest) : null,
        paymentResponse: transaction.paymentResponse ? Object.fromEntries(transaction.paymentResponse) : null,
        callbackUrl: transaction.callbackUrl,
        returnUrl: transaction.returnUrl,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get transaction details'
    });
  }
});

/**
 * @swagger
 * /payments/easebuzz/retrieve-transaction:
 *   post:
 *     summary: Retrieve transaction details from Easebuzz dashboard API
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txnid
 *             properties:
 *               txnid:
 *                 type: string
 *                 description: Transaction ID from Easebuzz
 *     responses:
 *       200:
 *         description: Transaction details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: Transaction details from Easebuzz
 */
router.post('/easebuzz/retrieve-transaction', authenticate, [
  body('txnid').notEmpty().withMessage('Transaction ID (txnid) is required')
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

    const { txnid } = req.body;

    // First, try to find transaction in database to get the correct Easebuzz transaction ID
    let transaction = await Transaction.findOne({ 
      $or: [
        { transactionId: txnid },
        { gatewayTransactionId: txnid }
      ],
      gateway: 'easebuzz'
    });

    // Use gatewayTransactionId if available (this is the actual Easebuzz transaction ID)
    // Otherwise use the provided txnid
    const easebuzzTxnId = transaction?.gatewayTransactionId || txnid;

    console.log('Retrieving transaction details:', {
      providedTxnId: txnid,
      easebuzzTxnId: easebuzzTxnId,
      foundInDB: !!transaction,
      usingGatewayTxnId: !!transaction?.gatewayTransactionId
    });

    // Get Easebuzz gateway instance
    const gatewayInstance = paymentService.getGateway('easebuzz');

    // Retrieve transaction details from Easebuzz using the correct transaction ID
    const result = await gatewayInstance.retrieveTransactionDetails(easebuzzTxnId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to retrieve transaction details',
        error: result.error
      });
    }

    // Transaction was already found above, but if not found, try again
    if (!transaction) {
      transaction = await Transaction.findOne({ 
        $or: [
          { transactionId: txnid },
          { transactionId: easebuzzTxnId },
          { gatewayTransactionId: txnid },
          { gatewayTransactionId: easebuzzTxnId }
        ],
        gateway: 'easebuzz'
      });
    }

    if (transaction) {
      // Update transaction with retrieved details
      const transactionDetails = result.transactionDetails;
      const gatewayStatus = transactionDetails?.status || transactionDetails?.payment_status;
      
      if (gatewayStatus) {
        let newStatus = 'pending';
        if (gatewayStatus === 'success' || gatewayStatus === 'completed' || gatewayStatus === 'paid') {
          newStatus = 'success';
        } else if (gatewayStatus === 'failed' || gatewayStatus === 'failure') {
          newStatus = 'failed';
        } else if (gatewayStatus === 'cancelled' || gatewayStatus === 'canceled') {
          newStatus = 'cancelled';
        }

        if (transaction.status !== newStatus) {
          transaction.status = newStatus;
        }
      }

      // Merge transaction details into paymentResponse
      const existingResponse = transaction.paymentResponse ? Object.fromEntries(transaction.paymentResponse) : {};
      transaction.paymentResponse = {
        ...existingResponse,
        ...transactionDetails,
        retrieved_at: new Date().toISOString()
      };

      transaction.updatedAt = new Date();
      await transaction.save();

      // Populate user and payment method
      await transaction.populate('userId', 'username email');
      await transaction.populate('paymentMethodId', 'name code');
    }

    res.json({
      success: true,
      message: 'Transaction details retrieved successfully',
      data: {
        transactionDetails: result.transactionDetails,
        transaction: transaction ? {
          transactionId: transaction.transactionId,
          gatewayTransactionId: transaction.gatewayTransactionId,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          gateway: transaction.gateway,
          userId: transaction.userId,
          paymentMethodId: transaction.paymentMethodId,
          updatedAt: transaction.updatedAt
        } : null
      }
    });
  } catch (error) {
    console.error('Retrieve transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve transaction details'
    });
  }
});

/**
 * @swagger
 * /payments/easebuzz/transactions-by-date:
 *   post:
 *     summary: Retrieve transactions by date from Easebuzz dashboard API
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transaction_date
 *             properties:
 *               transaction_date:
 *                 type: string
 *                 description: Transaction date in format dd-mm-yyyy (e.g., 15-01-2024). Will be URL encoded automatically.
 *                 example: "15-01-2024"
 *                 note: Merchant email is configured in environment variables (EASEBUZZ_MERCHANT_EMAIL)
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                     count:
 *                       type: integer
 */
router.post('/easebuzz/transactions-by-date', authenticate, [
  body('transaction_date')
    .notEmpty().withMessage('Transaction date is required')
    .matches(/^(\d{2})-(\d{2})-(\d{4})$/).withMessage('Transaction date must be in dd-mm-yyyy format (e.g., 15-01-2024)')
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

    const { transaction_date } = req.body;

    // Get Easebuzz gateway instance
    const gatewayInstance = paymentService.getGateway('easebuzz');

    // Retrieve transactions by date from Easebuzz
    // Merchant email is read from EASEBUZZ_MERCHANT_EMAIL environment variable
    const result = await gatewayInstance.retrieveTransactionsByDate(
      transaction_date
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to retrieve transactions by date',
        error: result.error,
        errorDetails: result.errorDetails
      });
    }

    res.json({
      success: true,
      message: 'Transactions retrieved successfully',
      data: {
        transactions: result.transactions || [],
        count: result.count || 0,
        transaction_date: transaction_date
      }
    });
  } catch (error) {
    console.error('Retrieve transactions by date error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve transactions by date'
    });
  }
});

/**
 * @swagger
 * /payments/easebuzz/transactions-by-date-range:
 *   post:
 *     summary: Retrieve transactions by date range from Easebuzz dashboard API (v2)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - start_date
 *               - end_date
 *             properties:
 *               start_date:
 *                 type: string
 *                 format: date
 *                 description: Start date in format dd-mm-yyyy
 *                 example: "10-05-2024"
 *               end_date:
 *                 type: string
 *                 format: date
 *                 description: End date in format dd-mm-yyyy (must be >= start_date)
 *                 example: "23-08-2024"
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                     count:
 *                       type: integer
 *                     pagination:
 *                       type: object
 */
router.post('/easebuzz/transactions-by-date-range', authenticate, [
  body('start_date')
    .notEmpty().withMessage('Start date is required')
    .matches(/^(\d{2})-(\d{2})-(\d{4})$/).withMessage('Start date must be in dd-mm-yyyy format (e.g., 10-05-2024)'),
  body('end_date')
    .notEmpty().withMessage('End date is required')
    .matches(/^(\d{2})-(\d{2})-(\d{4})$/).withMessage('End date must be in dd-mm-yyyy format (e.g., 23-08-2024)')
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

    const { start_date, end_date } = req.body;

    // Validate that end_date >= start_date
    const startParts = start_date.split('-');
    const endParts = end_date.split('-');
    const startDateObj = new Date(`${startParts[2]}-${startParts[1]}-${startParts[0]}`);
    const endDateObj = new Date(`${endParts[2]}-${endParts[1]}-${endParts[0]}`);
    
    if (endDateObj < startDateObj) {
      return res.status(400).json({
        success: false,
        message: 'End date must be greater than or equal to start date'
      });
    }

    // Get Easebuzz gateway instance
    const gatewayInstance = paymentService.getGateway('easebuzz');

    // Retrieve transactions by date range from Easebuzz
    // Merchant email is read from EASEBUZZ_MERCHANT_EMAIL environment variable
    const result = await gatewayInstance.retrieveTransactionsByDateRange(
      start_date,
      end_date
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to retrieve transactions by date range',
        error: result.error,
        errorDetails: result.errorDetails
      });
    }

    res.json({
      success: true,
      message: 'Transactions retrieved successfully',
      data: {
        transactions: result.transactions || [],
        count: result.count || 0,
        start_date: start_date,
        end_date: end_date,
        pagination: result.pagination || null
      }
    });
  } catch (error) {
    console.error('Retrieve transactions by date range error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve transactions by date range'
    });
  }
});

/**
 * @swagger
 * /payments/easebuzz-response:
 *   post:
 *     summary: Handle Easebuzz webhook response (Public endpoint for webhooks)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               txnid:
 *                 type: string
 *                 description: Transaction ID
 *               amount:
 *                 type: string
 *                 description: Transaction amount
 *               productinfo:
 *                 type: string
 *                 description: Product information
 *               firstname:
 *                 type: string
 *                 description: Customer first name
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Customer email
 *               status:
 *                 type: string
 *                 enum: [success, failure, pending]
 *                 description: Payment status
 *               hash:
 *                 type: string
 *                 description: Hash for verification
 *               phone:
 *                 type: string
 *                 description: Customer phone number
 *               udf1:
 *                 type: string
 *                 description: User defined field 1
 *               udf2:
 *                 type: string
 *                 description: User defined field 2
 *               udf3:
 *                 type: string
 *                 description: User defined field 3
 *               udf4:
 *                 type: string
 *                 description: User defined field 4
 *               udf5:
 *                 type: string
 *                 description: User defined field 5
 *             required:
 *               - txnid
 *               - amount
 *               - status
 *               - hash
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                     status:
 *                       type: string
 */
router.post('/easebuzz-response', async (req, res) => {
  try {
    console.log('Easebuzz callback received:', JSON.stringify(req.body, null, 2));
    
    const result = await paymentService.handleCallback('easebuzz', req.body);

    // Return comprehensive transaction details
    res.json({
      success: true,
      message: 'Webhook processed successfully',
      data: {
        transactionId: result.transaction.transactionId,
        gatewayTransactionId: result.transaction.gatewayTransactionId,
        status: result.transaction.status,
        amount: result.transaction.amount,
        currency: result.transaction.currency,
        gateway: result.transaction.gateway,
        userId: result.transaction.userId,
        paymentMethodId: result.transaction.paymentMethodId,
        paymentRequest: result.transaction.paymentRequest ? Object.fromEntries(result.transaction.paymentRequest) : null,
        paymentResponse: result.transaction.paymentResponse ? Object.fromEntries(result.transaction.paymentResponse) : null,
        callbackUrl: result.transaction.callbackUrl,
        returnUrl: result.transaction.returnUrl,
        createdAt: result.transaction.createdAt,
        updatedAt: result.transaction.updatedAt
      }
    });
  } catch (error) {
    console.error('Easebuzz webhook error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process webhook',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Get all transactions (Admin only)
 *     tags: [Payments]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, failed, cancelled]
 *       - in: query
 *         name: gateway
 *         schema:
 *           type: string
 *           enum: [easebuzz, upigateway]
 *     responses:
 *       200:
 *         description: List of transactions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
/**
 * @swagger
 * /payments/upigateway-response:
 *   post:
 *     summary: Handle UPI Gateway webhook response (Public endpoint for webhooks)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order_id:
 *                 type: string
 *                 description: Order/Transaction ID
 *               amount:
 *                 type: string
 *                 description: Transaction amount
 *               status:
 *                 type: string
 *                 enum: [success, completed, failed, pending, cancelled]
 *                 description: Payment status
 *               signature:
 *                 type: string
 *                 description: Signature for verification
 *               merchant_id:
 *                 type: string
 *                 description: Merchant ID
 *               payment_id:
 *                 type: string
 *                 description: Payment ID from gateway
 *               customer_name:
 *                 type: string
 *                 description: Customer name
 *               customer_email:
 *                 type: string
 *                 format: email
 *                 description: Customer email
 *               customer_phone:
 *                 type: string
 *                 description: Customer phone number
 *               timestamp:
 *                 type: string
 *                 description: Transaction timestamp
 *               currency:
 *                 type: string
 *                 description: Currency code
 *               description:
 *                 type: string
 *                 description: Transaction description
 *             required:
 *               - order_id
 *               - amount
 *               - status
 *               - signature
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                     status:
 *                       type: string
 */
router.post('/upigateway-response', async (req, res) => {
  try {
    console.log('UPI Gateway callback received:', JSON.stringify(req.body, null, 2));
    
    const result = await paymentService.handleCallback('upigateway', req.body);

    // Return comprehensive transaction details
    res.json({
      success: true,
      message: 'Webhook processed successfully',
      data: {
        transactionId: result.transaction.transactionId,
        gatewayTransactionId: result.transaction.gatewayTransactionId,
        status: result.transaction.status,
        amount: result.transaction.amount,
        currency: result.transaction.currency,
        gateway: result.transaction.gateway,
        userId: result.transaction.userId,
        paymentMethodId: result.transaction.paymentMethodId,
        paymentRequest: result.transaction.paymentRequest ? Object.fromEntries(result.transaction.paymentRequest) : null,
        paymentResponse: result.transaction.paymentResponse ? Object.fromEntries(result.transaction.paymentResponse) : null,
        callbackUrl: result.transaction.callbackUrl,
        returnUrl: result.transaction.returnUrl,
        createdAt: result.transaction.createdAt,
        updatedAt: result.transaction.updatedAt
      }
    });
  } catch (error) {
    console.error('UPI Gateway webhook error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process webhook',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @swagger
 * /payments/success:
 *   get:
 *     summary: Handle UPI Gateway success redirect
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: client_txn_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client transaction ID
 *       - in: query
 *         name: txn_id
 *         schema:
 *           type: string
 *         description: Gateway transaction ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [success, failed, pending]
 *         description: Payment status
 *     responses:
 *       200:
 *         description: Payment success response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactionId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     gateway:
 *                       type: string
 */
router.get('/success', async (req, res) => {
  try {
    const { client_txn_id, txn_id, status } = req.query;

    if (!client_txn_id) {
      return res.status(400).json({
        success: false,
        message: 'client_txn_id is required'
      });
    }

    // Find transaction by client_txn_id
    const transaction = await Transaction.findOne({ 
      transactionId: client_txn_id 
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
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

    // Return success response
    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        gateway: transaction.gateway,
        gatewayTransactionId: transaction.gatewayTransactionId || txn_id,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });
  } catch (error) {
    console.error('UPI Gateway success handler error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process payment success'
    });
  }
});

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Get all transactions (Admin only)
 *     tags: [Payments]
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, failed, cancelled]
 *       - in: query
 *         name: gateway
 *         schema:
 *           type: string
 *           enum: [easebuzz, upigateway]
 *     responses:
 *       200:
 *         description: List of transactions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
router.get('/', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.gateway) {
      filter.gateway = req.query.gateway;
    }

    const transactions = await Transaction.find(filter)
      .populate('userId', 'username email')
      .populate('paymentMethodId', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(filter);

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
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
});

module.exports = router;

