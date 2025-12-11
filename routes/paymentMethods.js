const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { dynamicRateLimiter } = require('../middleware/rateLimiter');
const PaymentMethod = require('../models/PaymentMethod');

const router = express.Router();

/**
 * @swagger
 * /payment-methods/active:
 *   get:
 *     summary: Get active payment methods (Public)
 *     tags: [Payment Methods]
 *     responses:
 *       200:
 *         description: List of active payment methods
 */
router.get('/active', async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({ isActive: true })
      .select('name code gateway')
      .sort({ name: 1 });

    res.json({
      success: true,
      data: paymentMethods
    });
  } catch (error) {
    console.error('Get active payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active payment methods'
    });
  }
});

/**
 * @swagger
 * /payment-methods:
 *   get:
 *     summary: Get all payment methods (Admin only)
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all payment methods
 */
router.get('/', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
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
 * /payment-methods/set-active:
 *   put:
 *     summary: Set multiple active payment methods (Admin only)
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethodIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Payment methods updated
 */
router.put('/set-active', authenticate, isAdmin, [
  body('paymentMethodIds').isArray().withMessage('Payment method IDs array is required')
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

    const { paymentMethodIds } = req.body;

    // Deactivate all first
    await PaymentMethod.updateMany({}, { isActive: false });

    // Activate selected ones
    if (paymentMethodIds.length > 0) {
      await PaymentMethod.updateMany(
        { _id: { $in: paymentMethodIds } },
        { isActive: true, updatedAt: new Date() }
      );
    }

    const updatedMethods = await PaymentMethod.find();

    res.json({
      success: true,
      message: 'Payment methods updated successfully',
      data: updatedMethods
    });
  } catch (error) {
    console.error('Set active payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment methods'
    });
  }
});

/**
 * @swagger
 * /payment-methods/set-active/{id}:
 *   put:
 *     summary: Set single active payment method (Admin only) Legacy
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment method updated
 */
router.put('/set-active/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findById(req.params.id);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    paymentMethod.isActive = true;
    paymentMethod.updatedAt = new Date();
    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Payment method activated successfully',
      data: paymentMethod
    });
  } catch (error) {
    console.error('Set active payment method error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment method'
    });
  }
});

/**
 * @swagger
 * /payment-methods/deactivate/{id}:
 *   put:
 *     summary: Deactivate specific payment method (Admin only)
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment method deactivated
 */
router.put('/deactivate/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findById(req.params.id);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        message: 'Payment method not found'
      });
    }

    paymentMethod.isActive = false;
    paymentMethod.updatedAt = new Date();
    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Payment method deactivated successfully',
      data: paymentMethod
    });
  } catch (error) {
    console.error('Deactivate payment method error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate payment method'
    });
  }
});

/**
 * @swagger
 * /payment-methods/deactivate-all:
 *   put:
 *     summary: Deactivate all payment methods (Admin only)
 *     tags: [Payment Methods]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All payment methods deactivated
 */
router.put('/deactivate-all', authenticate, isAdmin, async (req, res) => {
  try {
    await PaymentMethod.updateMany({}, { isActive: false, updatedAt: new Date() });

    res.json({
      success: true,
      message: 'All payment methods deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate all payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate payment methods'
    });
  }
});

module.exports = router;

