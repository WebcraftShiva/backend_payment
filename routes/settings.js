const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { dynamicRateLimiter } = require('../middleware/rateLimiter');
const Setting = require('../models/Setting');

const router = express.Router();

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Get all settings (Admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of settings
 */
router.get('/', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
  try {
    const settings = await Setting.find().sort({ key: 1 });

    // Convert to object format
    const settingsObject = {};
    settings.forEach(setting => {
      settingsObject[setting.key] = setting.value;
    });

    res.json({
      success: true,
      data: settingsObject
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
});

/**
 * @swagger
 * /settings/rate-limiting:
 *   put:
 *     summary: Update rate limiting settings (Admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               windowMs:
 *                 type: integer
 *               max:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Rate limiting settings updated
 */
router.put('/rate-limiting', authenticate, isAdmin, [
  body('enabled').optional().isBoolean().withMessage('enabled must be a boolean'),
  body('windowMs').optional().isInt({ min: 1000 }).withMessage('windowMs must be a positive integer'),
  body('max').optional().isInt({ min: 1 }).withMessage('max must be a positive integer')
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

    const { enabled, windowMs, max } = req.body;

    // Get existing setting or create new
    let rateLimitSetting = await Setting.findOne({ key: 'rateLimiting' });

    const settingValue = {
      enabled: enabled !== undefined ? enabled : (rateLimitSetting?.value?.enabled ?? true),
      windowMs: windowMs || rateLimitSetting?.value?.windowMs || 15 * 60 * 1000,
      max: max || rateLimitSetting?.value?.max || 100
    };

    if (rateLimitSetting) {
      rateLimitSetting.value = settingValue;
      rateLimitSetting.updatedAt = new Date();
      await rateLimitSetting.save();
    } else {
      rateLimitSetting = new Setting({
        key: 'rateLimiting',
        value: settingValue,
        description: 'Rate limiting configuration'
      });
      await rateLimitSetting.save();
    }

    res.json({
      success: true,
      message: 'Rate limiting settings updated successfully',
      data: {
        rateLimiting: rateLimitSetting.value
      }
    });
  } catch (error) {
    console.error('Update rate limiting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rate limiting settings'
    });
  }
});

/**
 * @swagger
 * /settings/rate-limiting/status:
 *   get:
 *     summary: Get rate limiting status (Admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rate limiting status
 */
router.get('/rate-limiting/status', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
  try {
    const rateLimitSetting = await Setting.findOne({ key: 'rateLimiting' });

    if (!rateLimitSetting) {
      return res.json({
        success: true,
        data: {
          enabled: true,
          windowMs: 15 * 60 * 1000,
          max: 100
        }
      });
    }

    res.json({
      success: true,
      data: rateLimitSetting.value
    });
  } catch (error) {
    console.error('Get rate limiting status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rate limiting status'
    });
  }
});

/**
 * @swagger
 * /settings/cors:
 *   get:
 *     summary: Get CORS allowed origins (Admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of allowed CORS origins
 */
router.get('/cors', authenticate, isAdmin, dynamicRateLimiter, async (req, res) => {
  try {
    const corsSetting = await Setting.findOne({ key: 'corsOrigins' });

    if (!corsSetting) {
      return res.json({
        success: true,
        data: {
          origins: []
        }
      });
    }

    res.json({
      success: true,
      data: {
        origins: corsSetting.value.origins || []
      }
    });
  } catch (error) {
    console.error('Get CORS settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch CORS settings'
    });
  }
});

/**
 * @swagger
 * /settings/cors:
 *   put:
 *     summary: Update CORS allowed origins (Admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - origins
 *             properties:
 *               origins:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of allowed CORS origins (URLs)
 *                 example: ["http://localhost:4200", "https://example.com"]
 *     responses:
 *       200:
 *         description: CORS settings updated
 */
router.put('/cors', authenticate, isAdmin, [
  body('origins')
    .isArray()
    .withMessage('origins must be an array')
    .custom((origins) => {
      if (!Array.isArray(origins)) {
        return false;
      }
      // Validate each origin is a valid URL
      const urlPattern = /^https?:\/\/.+/;
      return origins.every(origin => typeof origin === 'string' && urlPattern.test(origin));
    })
    .withMessage('All origins must be valid URLs (http:// or https://)')
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

    const { origins } = req.body;

    // Get existing setting or create new
    let corsSetting = await Setting.findOne({ key: 'corsOrigins' });

    const settingValue = {
      origins: origins || []
    };

    if (corsSetting) {
      corsSetting.value = settingValue;
      corsSetting.updatedAt = new Date();
      await corsSetting.save();
    } else {
      corsSetting = new Setting({
        key: 'corsOrigins',
        value: settingValue,
        description: 'CORS allowed origins configuration'
      });
      await corsSetting.save();
    }

    res.json({
      success: true,
      message: 'CORS settings updated successfully',
      data: {
        origins: corsSetting.value.origins
      }
    });
  } catch (error) {
    console.error('Update CORS settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update CORS settings'
    });
  }
});

/**
 * @swagger
 * /settings/cors:
 *   post:
 *     summary: Add a new CORS origin (Admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - origin
 *             properties:
 *               origin:
 *                 type: string
 *                 description: New CORS origin URL to add
 *                 example: "https://newdomain.com"
 *     responses:
 *       200:
 *         description: CORS origin added
 */
router.post('/cors', authenticate, isAdmin, [
  body('origin')
    .notEmpty()
    .withMessage('origin is required')
    .matches(/^https?:\/\/.+/)
    .withMessage('origin must be a valid URL (http:// or https://)')
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

    const { origin } = req.body;

    // Get existing setting or create new
    let corsSetting = await Setting.findOne({ key: 'corsOrigins' });

    const existingOrigins = corsSetting?.value?.origins || [];

    // Check if origin already exists
    if (existingOrigins.includes(origin)) {
      return res.status(400).json({
        success: false,
        message: 'Origin already exists in the allowed list'
      });
    }

    const settingValue = {
      origins: [...existingOrigins, origin]
    };

    if (corsSetting) {
      corsSetting.value = settingValue;
      corsSetting.updatedAt = new Date();
      await corsSetting.save();
    } else {
      corsSetting = new Setting({
        key: 'corsOrigins',
        value: settingValue,
        description: 'CORS allowed origins configuration'
      });
      await corsSetting.save();
    }

    res.json({
      success: true,
      message: 'CORS origin added successfully',
      data: {
        origins: corsSetting.value.origins
      }
    });
  } catch (error) {
    console.error('Add CORS origin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add CORS origin'
    });
  }
});

/**
 * @swagger
 * /settings/cors/{origin}:
 *   delete:
 *     summary: Remove a CORS origin (Admin only)
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: origin
 *         required: true
 *         schema:
 *           type: string
 *         description: CORS origin URL to remove (URL encoded)
 *     responses:
 *       200:
 *         description: CORS origin removed
 */
router.delete('/cors/:origin', authenticate, isAdmin, async (req, res) => {
  try {
    const origin = decodeURIComponent(req.params.origin);

    const corsSetting = await Setting.findOne({ key: 'corsOrigins' });

    if (!corsSetting || !corsSetting.value.origins) {
      return res.status(404).json({
        success: false,
        message: 'CORS origins not found'
      });
    }

    const existingOrigins = corsSetting.value.origins || [];
    const filteredOrigins = existingOrigins.filter(o => o !== origin);

    if (filteredOrigins.length === existingOrigins.length) {
      return res.status(404).json({
        success: false,
        message: 'Origin not found in the allowed list'
      });
    }

    corsSetting.value.origins = filteredOrigins;
    corsSetting.updatedAt = new Date();
    await corsSetting.save();

    res.json({
      success: true,
      message: 'CORS origin removed successfully',
      data: {
        origins: corsSetting.value.origins
      }
    });
  } catch (error) {
    console.error('Remove CORS origin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove CORS origin'
    });
  }
});

module.exports = router;

