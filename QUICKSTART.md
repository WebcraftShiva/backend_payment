# Quick Start Guide

## Prerequisites Check

Before starting, ensure you have:
- ✅ Node.js installed (v14+)
- ✅ MongoDB running locally or connection string
- ✅ Payment gateway credentials (Easebuzz and/or UPI Gateway)

## Step-by-Step Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your configuration:
```env
PORT=9000
MONGODB_URI=mongodb://localhost:27017/payment-backend
JWT_SECRET=your-super-secret-jwt-key-change-this

# Easebuzz (if using)
EASEBUZZ_KEY=your-key-here
EASEBUZZ_SALT=your-salt-here

# UPI Gateway (if using)
UPIGATEWAY_MERCHANT_ID=your-merchant-id
UPIGATEWAY_MERCHANT_KEY=your-merchant-key
```

### 3. Start MongoDB
Make sure MongoDB is running:
```bash
# On Windows (if installed as service, it should auto-start)
# On Linux/Mac
mongod
```

### 4. Seed Initial Data
This creates the default admin user and payment methods:
```bash
node scripts/seedData.js
```

Default admin credentials:
- Username: `admin`
- Password: `admin123`

⚠️ **Change this password immediately after first login!**

### 5. Start the Server
```bash
# Development mode (auto-reload on changes)
npm run dev

# Production mode
npm start
```

### 6. Access API Documentation
Open your browser and navigate to:
```
http://localhost:9000/api-docs
```

## Testing the API

### 1. Login as Admin
```bash
curl -X POST http://localhost:9000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Save the `token` from the response.

### 2. Create a Test Payment
```bash
curl -X POST http://localhost:9000/api/payments/create-payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "amount": 100,
    "email": "test@example.com",
    "firstName": "Test",
    "phone": "1234567890",
    "productInfo": "Test Product",
    "returnUrl": "https://yoursite.com/success"
  }'
```

### 3. Check Payment Status
```bash
curl -X POST http://localhost:9000/api/payments/payment-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"transactionId":"TXN123456789"}'
```

## Webhook Configuration

### For Easebuzz:
1. In your Easebuzz dashboard, set webhook URL to:
   ```
   http://your-domain.com/api/payments/easebuzz-response
   ```

### For UPI Gateway:
1. In your UPI Gateway dashboard, set webhook URL to:
   ```
   http://your-domain.com/api/payments/upigateway-response
   ```

**Note:** Webhook endpoints are public (no authentication required) but use signature verification for security.

## Common Issues

### MongoDB Connection Error
- Ensure MongoDB is running
- Check `MONGODB_URI` in `.env` is correct
- Verify MongoDB is accessible from your network

### Payment Gateway Errors
- Verify your gateway credentials in `.env`
- Check if you're using test/production URLs correctly
- Ensure your gateway account is active

### Port Already in Use
- Change `PORT` in `.env` to a different port
- Or stop the process using port 9000

## Next Steps

1. **Change default admin password** - Use the `/api/users/{userId}/password` endpoint
2. **Configure payment methods** - Activate/deactivate via `/api/payment-methods`
3. **Set up webhooks** - Configure in your payment gateway dashboards
4. **Review rate limiting** - Adjust via `/api/settings/rate-limiting`

## Production Deployment

Before deploying to production:

1. ✅ Change `JWT_SECRET` to a strong random string
2. ✅ Use production MongoDB (MongoDB Atlas recommended)
3. ✅ Update payment gateway URLs to production
4. ✅ Enable HTTPS
5. ✅ Configure proper CORS settings
6. ✅ Set up monitoring and logging
7. ✅ Review and adjust rate limiting
8. ✅ Change default admin password

## Support

For issues or questions, refer to the main README.md file.

