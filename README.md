# Payment Backend API

A comprehensive payment processing backend API with support for multiple payment gateways including UPI Gateway and Easebuzz. This API provides authentication, payment processing, user management, and administrative dashboard functionality.

## Features

- 🔐 **Authentication**: JWT-based admin authentication
- 💳 **Payment Processing**: Support for Easebuzz and UPI Gateway
- 👥 **User Management**: Complete user CRUD operations
- 📊 **Dashboard**: Real-time statistics and analytics
- ⚙️ **Settings**: Configurable rate limiting and system settings
- 📝 **API Documentation**: Swagger/OpenAPI documentation
- 🔒 **Security**: Rate limiting, CORS, Helmet security headers
- 🔄 **Webhooks**: Support for payment gateway callbacks

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd BackEnd-for-PaymentGate_Integration
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
PORT=9000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/payment-backend
JWT_SECRET=your-super-secret-jwt-key
EASEBUZZ_KEY=your-easebuzz-key
EASEBUZZ_SALT=your-easebuzz-salt
EASEBUZZ_BASE_URL=https://testpay.easebuzz.in
UPIGATEWAY_MERCHANT_ID=your-upigateway-merchant-id
UPIGATEWAY_MERCHANT_KEY=your-upigateway-merchant-key
UPIGATEWAY_BASE_URL=https://api.upigateway.com
```

5. Seed initial data (creates default admin user):
```bash
node scripts/seedData.js
```

6. Start the server:
```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:9000` (or the port specified in `.env`).

## API Documentation

Once the server is running, access the Swagger API documentation at:
```
http://localhost:9000/api-docs
```

## Default Admin Credentials

After running the seed script, you can login with:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Important**: Change the default password immediately after first login!

## API Endpoints

### Authentication
- `POST /api/auth/login` - Admin login

### Payments
- `POST /api/payments/create-payment` - Create a new payment (requires authentication)
- `POST /api/payments/payment-status` - Check payment status (requires authentication)
- `POST /api/payments/easebuzz-response` - Handle Easebuzz webhook (requires authentication)
- `GET /api/payments` - Get all transactions (Admin only)

### Payment Methods
- `GET /api/payment-methods/active` - Get active payment methods (Public)
- `GET /api/payment-methods` - Get all payment methods (Admin only)
- `PUT /api/payment-methods/set-active` - Set multiple active payment methods (Admin only)
- `PUT /api/payment-methods/set-active/{id}` - Set single active payment method (Admin only)
- `PUT /api/payment-methods/deactivate/{id}` - Deactivate specific payment method (Admin only)
- `PUT /api/payment-methods/deactivate-all` - Deactivate all payment methods (Admin only)

### Users
- `GET /api/users` - Get all users (Admin only)
- `POST /api/users` - Create a new user (Admin only)
- `GET /api/users/{userId}/transactions` - Get transactions for a specific user (Admin only)
- `PATCH /api/users/{userId}/status` - Enable or disable a user (Admin only)
- `PATCH /api/users/{userId}/password` - Update user password (Admin only)
- `PATCH /api/users/{userId}/payment-gateway` - Assign payment gateway to user (Admin only)
- `GET /api/users/payment-methods` - Get all payment methods (Admin only)

### Dashboard
- `GET /api/dashboard` - Get dashboard statistics (Admin only)

### Settings
- `GET /api/settings` - Get all settings (Admin only)
- `PUT /api/settings/rate-limiting` - Update rate limiting settings (Admin only)
- `GET /api/settings/rate-limiting/status` - Get rate limiting status (Admin only)

## Usage Examples

### 1. Login as Admin
```bash
curl -X POST http://localhost:9000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### 2. Create a Payment
```bash
curl -X POST http://localhost:9000/api/payments/create-payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": 1000,
    "email": "customer@example.com",
    "firstName": "John",
    "phone": "1234567890",
    "productInfo": "Test Product",
    "returnUrl": "https://yoursite.com/success",
    "callbackUrl": "https://yoursite.com/webhook"
  }'
```

### 3. Check Payment Status
```bash
curl -X POST http://localhost:9000/api/payments/payment-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "transactionId": "TXN123456789"
  }'
```

## Integration Guide

### Using as Deep Link

1. Create a payment using the `/api/payments/create-payment` endpoint
2. The response will contain a `paymentLink` which you can redirect users to
3. Users complete the payment on the gateway's page
4. Gateway redirects back to your `returnUrl` with payment status

### Using as Webhook

1. Configure your webhook URL in the payment gateway dashboard
2. When creating a payment, include your `callbackUrl` in the request
3. The gateway will send payment status updates to your `callbackUrl`
4. Use the `/api/payments/easebuzz-response` endpoint to process Easebuzz webhooks

## Project Structure

```
BackEnd-for-PaymentGate_Integration/
├── models/              # MongoDB models
│   ├── User.js
│   ├── Transaction.js
│   ├── PaymentMethod.js
│   └── Setting.js
├── routes/              # API routes
│   ├── auth.js
│   ├── payments.js
│   ├── paymentMethods.js
│   ├── users.js
│   ├── dashboard.js
│   └── settings.js
├── services/            # Business logic
│   ├── paymentService.js
│   └── paymentGateways/
│       ├── easebuzz.js
│       └── upigateway.js
├── middleware/          # Express middleware
│   ├── auth.js
│   └── rateLimiter.js
├── scripts/             # Utility scripts
│   └── seedData.js
├── server.js            # Main server file
├── package.json
├── .env.example
└── README.md
```

## Security Considerations

1. **Change Default Credentials**: Always change the default admin password
2. **JWT Secret**: Use a strong, random JWT secret in production
3. **Environment Variables**: Never commit `.env` file to version control
4. **HTTPS**: Use HTTPS in production
5. **Rate Limiting**: Configure appropriate rate limits for your use case
6. **CORS**: Configure CORS properly for production

## Payment Gateway Configuration

### Easebuzz
- Get your API key and salt from Easebuzz dashboard
- Configure in `.env` file:
  - `EASEBUZZ_KEY`
  - `EASEBUZZ_SALT`
  - `EASEBUZZ_BASE_URL` (optional, defaults to test URL)

### UPI Gateway
- Get your merchant ID and key from UPI Gateway dashboard
- Configure in `.env` file:
  - `UPIGATEWAY_MERCHANT_ID`
  - `UPIGATEWAY_MERCHANT_KEY`
  - `UPIGATEWAY_BASE_URL` (optional)

## Error Handling

The API returns errors in the following format:
```json
{
  "success": false,
  "message": "Error message",
  "errors": [] // Optional validation errors
}
```

## License

MIT

## Support

For API support, please contact the development team.

