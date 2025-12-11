const rateLimit = require('express-rate-limit');
const Setting = require('../models/Setting');

// Default rate limit configuration
const defaultRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
};

// Create rate limiter with dynamic configuration
const createRateLimiter = (options = {}) => {
  return rateLimit({
    ...defaultRateLimit,
    ...options
  });
};

// General API rate limiter
const apiLimiter = createRateLimiter();

// Strict rate limiter for authentication
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again after 15 minutes.'
});

// Payment rate limiter
const paymentLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many payment requests, please try again later.'
});

// Dynamic rate limiter that reads from settings
const dynamicRateLimiter = async (req, res, next) => {
  try {
    const rateLimitSetting = await Setting.findOne({ key: 'rateLimiting' });
    
    if (rateLimitSetting && rateLimitSetting.value.enabled) {
      const limiter = createRateLimiter({
        windowMs: rateLimitSetting.value.windowMs || defaultRateLimit.windowMs,
        max: rateLimitSetting.value.max || defaultRateLimit.max
      });
      return limiter(req, res, next);
    }
    
    // Use default if no setting found
    return apiLimiter(req, res, next);
  } catch (error) {
    // Fallback to default on error
    return apiLimiter(req, res, next);
  }
};

module.exports = {
  apiLimiter,
  authLimiter,
  paymentLimiter,
  dynamicRateLimiter
};

