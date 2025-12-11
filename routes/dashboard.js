const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const { dynamicRateLimiter } = require('../middleware/rateLimiter');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');

const router = express.Router();

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Get dashboard statistics (Admin only)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardStats'
 */
router.get('/', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
  try {
    // Get total users
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });

    // Get transaction statistics
    const totalTransactions = await Transaction.countDocuments();
    const successfulTransactions = await Transaction.countDocuments({ status: 'success' });
    const pendingTransactions = await Transaction.countDocuments({ status: 'pending' });
    const failedTransactions = await Transaction.countDocuments({ status: 'failed' });

    // Get revenue statistics
    const revenueData = await Transaction.aggregate([
      {
        $match: { status: 'success' }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          averageTransaction: { $avg: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = revenueData[0]?.totalRevenue || 0;
    const averageTransaction = revenueData[0]?.averageTransaction || 0;

    // Get transactions by gateway
    const transactionsByGateway = await Transaction.aggregate([
      {
        $group: {
          _id: '$gateway',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Get recent transactions
    const recentTransactions = await Transaction.find()
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('transactionId amount status gateway createdAt');

    // Get payment methods statistics
    const totalPaymentMethods = await PaymentMethod.countDocuments();
    const activePaymentMethods = await PaymentMethod.countDocuments({ isActive: true });

    // Get transactions by status for chart
    const transactionsByStatus = await Transaction.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get daily revenue for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyRevenue = await Transaction.aggregate([
      {
        $match: {
          status: 'success',
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers
        },
        transactions: {
          total: totalTransactions,
          successful: successfulTransactions,
          pending: pendingTransactions,
          failed: failedTransactions,
          byStatus: transactionsByStatus,
          byGateway: transactionsByGateway
        },
        revenue: {
          total: totalRevenue,
          average: averageTransaction,
          daily: dailyRevenue
        },
        paymentMethods: {
          total: totalPaymentMethods,
          active: activePaymentMethods
        },
        recentTransactions: recentTransactions
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

module.exports = router;

