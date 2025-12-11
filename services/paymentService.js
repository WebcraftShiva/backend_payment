const EasebuzzGateway = require('./paymentGateways/easebuzz');
const UPIGateway = require('./paymentGateways/upigateway');
const Transaction = require('../models/Transaction');
const PaymentMethod = require('../models/PaymentMethod');
const User = require('../models/User');

class PaymentService {
  constructor() {
    this.gateways = {};
  }

  /**
   * Initialize gateway with configuration
   */
  initializeGateway(gatewayName, config) {
    switch (gatewayName.toLowerCase()) {
      case 'easebuzz':
        this.gateways.easebuzz = new EasebuzzGateway(config);
        break;
      case 'upigateway':
        this.gateways.upigateway = new UPIGateway(config);
        break;
      default:
        throw new Error(`Unsupported gateway: ${gatewayName}`);
    }
  }

  /**
   * Get gateway instance
   */
  getGateway(gatewayName) {
    const gateway = this.gateways[gatewayName.toLowerCase()];
    if (!gateway) {
      throw new Error(`Gateway ${gatewayName} not initialized`);
    }
    return gateway;
  }

  /**
   * Create payment
   */
  async createPayment(userId, paymentData) {
    try {
      // Get user to determine gateway
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Determine gateway (user preference or default)
      let gateway = paymentData.gateway || user.paymentGateway;
      if (!gateway) {
        // Get first active payment method
        const activeMethod = await PaymentMethod.findOne({ isActive: true });
        if (!activeMethod) {
          throw new Error('No active payment method available');
        }
        gateway = activeMethod.gateway;
      }

      // Get gateway instance
      const gatewayInstance = this.getGateway(gateway);

      // Generate transaction ID
      const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Prepare payment data for gateway
      // Unified payload mapping - supports both Easebuzz and UPI Gateway fields
      const gatewayPaymentData = {
        // Common fields
        amount: paymentData.amount,
        transactionId: transactionId,
        txnid: transactionId,
        client_txn_id: paymentData.client_txn_id || transactionId,
        
        // Product/Description fields (Easebuzz: productinfo, UPI: p_info)
        productInfo: paymentData.productInfo || paymentData.productinfo || paymentData.p_info || paymentData.description || 'Payment',
        productinfo: paymentData.productinfo || paymentData.productInfo || paymentData.p_info || paymentData.description || 'Payment',
        p_info: paymentData.p_info || paymentData.productinfo || paymentData.productInfo || paymentData.description || 'Payment',
        
        // Customer name fields (Easebuzz: firstname, UPI: customer_name)
        firstName: paymentData.firstName || paymentData.firstname || paymentData.customerName || paymentData.customer_name || 'Customer',
        firstname: paymentData.firstname || paymentData.firstName || paymentData.customerName || paymentData.customer_name || 'Customer',
        customerName: paymentData.customerName || paymentData.customer_name || paymentData.firstname || paymentData.firstName || 'Customer',
        customer_name: paymentData.customer_name || paymentData.customerName || paymentData.firstname || paymentData.firstName || 'Customer',
        
        // Email fields (both gateways)
        email: paymentData.email || paymentData.customerEmail || paymentData.customer_email || '',
        customerEmail: paymentData.customerEmail || paymentData.customer_email || paymentData.email || '',
        customer_email: paymentData.customer_email || paymentData.customerEmail || paymentData.email || '',
        
        // Phone fields (Easebuzz: phone, UPI: customer_mobile)
        phone: paymentData.phone || paymentData.customerPhone || paymentData.customer_mobile || '',
        customerPhone: paymentData.customerPhone || paymentData.customer_mobile || paymentData.phone || '',
        customer_mobile: paymentData.customer_mobile || paymentData.customerPhone || paymentData.phone || '',
        
        // URL fields (Easebuzz: surl/furl, UPI: redirect_url)
        successUrl: paymentData.successUrl || paymentData.surl || paymentData.returnUrl || paymentData.redirect_url || '',
        surl: paymentData.surl || paymentData.successUrl || paymentData.returnUrl || paymentData.redirect_url || '',
        returnUrl: paymentData.returnUrl || paymentData.successUrl || paymentData.redirect_url || '',
        redirect_url: paymentData.redirect_url || paymentData.returnUrl || paymentData.successUrl || paymentData.surl || '',
        failureUrl: paymentData.failureUrl || paymentData.furl || paymentData.failure_redirect_url || '',
        furl: paymentData.furl || paymentData.failureUrl || paymentData.failure_redirect_url || '',
        failure_redirect_url: paymentData.failure_redirect_url || paymentData.furl || paymentData.failureUrl || '',
        
        // UDF fields (both gateways support udf1-udf3, Easebuzz supports up to udf10)
        udf1: paymentData.udf1 || '',
        udf2: paymentData.udf2 || '',
        udf3: paymentData.udf3 || '',
        udf4: paymentData.udf4 || '',
        udf5: paymentData.udf5 || '',
        udf6: paymentData.udf6 || '',
        udf7: paymentData.udf7 || '',
        udf8: paymentData.udf8 || '',
        udf9: paymentData.udf9 || '',
        udf10: paymentData.udf10 || '',
        
        // Address fields (Easebuzz specific)
        address1: paymentData.address1 || '',
        address2: paymentData.address2 || '',
        city: paymentData.city || '',
        state: paymentData.state || '',
        country: paymentData.country || '',
        zipcode: paymentData.zipcode || '',
        
        // Easebuzz specific optional fields
        show_payment_mode: paymentData.show_payment_mode,
        split_payments: paymentData.split_payments,
        request_flow: paymentData.request_flow,
        sub_merchant_id: paymentData.sub_merchant_id,
        payment_category: paymentData.payment_category,
        account_no: paymentData.account_no,
        ifsc: paymentData.ifsc,
        unique_id: paymentData.unique_id,
        
        currency: paymentData.currency || 'INR'
      };

      // Create payment in gateway
      const gatewayResponse = await gatewayInstance.createPayment(gatewayPaymentData);

      if (!gatewayResponse.success) {
        throw new Error(gatewayResponse.error || gatewayResponse.msg || 'Payment creation failed');
      }

      // Get payment method
      const paymentMethod = await PaymentMethod.findOne({ gateway: gateway, isActive: true });

      // Create transaction record
      const transaction = new Transaction({
        userId: userId,
        paymentMethodId: paymentMethod?._id,
        gateway: gateway,
        amount: paymentData.amount,
        currency: paymentData.currency || 'INR',
        status: 'pending',
        transactionId: transactionId,
        // Store gateway transaction ID (payment ID from Easebuzz or transaction ID for UPI)
        gatewayTransactionId: gatewayResponse.gatewayTransactionId || gatewayResponse.data?.payment_id || transactionId,
        paymentRequest: gatewayPaymentData,
        paymentResponse: gatewayResponse.rawResponse || gatewayResponse.data,
        callbackUrl: paymentData.callbackUrl,
        returnUrl: paymentData.returnUrl || paymentData.successUrl
      });

      await transaction.save();

      // Extract order_id from gateway response or use transactionId
      const orderId = gatewayResponse.data?.order_id || gatewayResponse.orderId || transactionId;

      // Update transaction with order_id if different
      if (orderId !== transactionId) {
        transaction.transactionId = orderId;
        await transaction.save();
      }
      
      // For Easebuzz: The txnid we sent is what should be used for retrieval
      // The payment_id from response is just for the payment URL
      // So transactionId should remain as the txnid we sent

      // Return response in the format expected by the user
      return {
        success: true,
        status: gatewayResponse.status !== undefined ? gatewayResponse.status : true,
        transactionId: orderId,
        paymentLink: gatewayResponse.paymentLink || gatewayResponse.data?.payment_url,
        transaction: transaction,
        gateway: gateway,
        // Return in the format user expects
        responseData: {
          status: gatewayResponse.status !== undefined ? gatewayResponse.status : true,
          data: {
            order_id: orderId,
            payment_url: gatewayResponse.paymentLink || gatewayResponse.data?.payment_url
          },
          msg: gatewayResponse.msg || 'Payment initiated successfully'
        }
      };
    } catch (error) {
      console.error('Payment creation error:', error);
      throw error;
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(transactionId, txn_date = null) {
    try {
      const transaction = await Transaction.findOne({ transactionId })
        .populate('userId', 'username email');
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      const gatewayInstance = this.getGateway(transaction.gateway);
      
      // For Easebuzz, pass transaction data to get email and phone
      // For UPI Gateway, pass txn_date if provided
      let statusResponse;
      if (transaction.gateway === 'easebuzz') {
        // Pass transaction data to Easebuzz for retrieving details
        statusResponse = await gatewayInstance.checkPaymentStatus(transactionId, transaction);
      } else {
        // UPI Gateway
        statusResponse = await gatewayInstance.checkPaymentStatus(transactionId, txn_date);
      }

      if (statusResponse.success) {
        // Update transaction with retrieved details
        const transactionDetails = statusResponse.transactionDetails || statusResponse.data;
        
        // Determine status from transaction details
        const gatewayStatus = transactionDetails?.status || 
                            transactionDetails?.payment_status || 
                            statusResponse.data?.status || 
                            statusResponse.data?.payment_status;
        
        if (gatewayStatus) {
          let newStatus = 'pending';
          if (gatewayStatus === 'success' || gatewayStatus === 'completed' || gatewayStatus === 'paid') {
            newStatus = 'success';
          } else if (gatewayStatus === 'failed' || gatewayStatus === 'failure') {
            newStatus = 'failed';
          } else if (gatewayStatus === 'cancelled' || gatewayStatus === 'canceled') {
            newStatus = 'cancelled';
          }

          // Update transaction if status changed or if we have new details
          const shouldUpdate = transaction.status !== newStatus || transactionDetails;
          
          if (shouldUpdate) {
            if (transaction.status !== newStatus) {
              transaction.status = newStatus;
            }
            
            // Store gateway transaction ID
            const gatewayTxnId = transactionDetails?.txnid || 
                                transactionDetails?.transaction_id ||
                                statusResponse.data?.gateway_transaction_id || 
                                statusResponse.data?.txnid;
            
            if (gatewayTxnId) {
              transaction.gatewayTransactionId = gatewayTxnId;
            }

            // Merge transaction details into paymentResponse
            const existingResponse = transaction.paymentResponse ? Object.fromEntries(transaction.paymentResponse) : {};
            transaction.paymentResponse = {
              ...existingResponse,
              ...transactionDetails,
              status_check_date: new Date().toISOString(),
              status_check_response: statusResponse.data
            };

            transaction.updatedAt = new Date();
            await transaction.save();
            
            console.log(`Transaction ${transactionId} updated with details. Status: ${transaction.status}`);
          }
        }
      }

      // Populate payment method for complete details
      await transaction.populate('paymentMethodId', 'name code');

      return {
        success: true,
        transaction: transaction,
        status: transaction.status,
        gatewayResponse: statusResponse.data,
        transactionDetails: statusResponse.transactionDetails || statusResponse.data
      };
    } catch (error) {
      console.error('Payment status check error:', error);
      throw error;
    }
  }

  /**
   * Handle gateway callback/webhook
   */
  async handleCallback(gatewayName, callbackData) {
    try {
      console.log(`Processing ${gatewayName} callback:`, JSON.stringify(callbackData, null, 2));
      
      const gatewayInstance = this.getGateway(gatewayName);
      const callbackResult = gatewayInstance.handleCallback(callbackData);

      if (!callbackResult.success) {
        throw new Error(callbackResult.error);
      }

      // Find transaction by transactionId or gateway transaction ID
      let transaction = await Transaction.findOne({
        transactionId: callbackResult.transactionId
      });

      // If not found, try to find by gateway transaction ID
      if (!transaction) {
        const gatewayTxnId = callbackData.gateway_transaction_id || callbackData.txnid || callbackData.order_id || callbackData.client_txn_id;
        if (gatewayTxnId) {
          transaction = await Transaction.findOne({
            $or: [
              { transactionId: gatewayTxnId },
              { gatewayTransactionId: gatewayTxnId }
            ]
          });
        }
      }

      if (!transaction) {
        throw new Error(`Transaction not found for ID: ${callbackResult.transactionId}`);
      }

      // Update transaction with callback data
      const oldStatus = transaction.status;
      transaction.status = callbackResult.status;
      
      // Store gateway transaction ID
      const gatewayTxnId = callbackData.gateway_transaction_id || 
                          callbackData.txnid || 
                          callbackData.order_id || 
                          callbackData.client_txn_id ||
                          callbackResult.transactionId;
      
      if (gatewayTxnId) {
        transaction.gatewayTransactionId = gatewayTxnId;
      }

      // Merge callback data into paymentResponse
      const existingResponse = transaction.paymentResponse ? Object.fromEntries(transaction.paymentResponse) : {};
      transaction.paymentResponse = {
        ...existingResponse,
        ...callbackResult.data,
        callback_received_at: new Date().toISOString(),
        callback_data: callbackData
      };

      transaction.updatedAt = new Date();
      await transaction.save();

      console.log(`Transaction ${transaction.transactionId} updated: ${oldStatus} -> ${transaction.status}`);

      // Populate user and payment method for complete details
      await transaction.populate('userId', 'username email');
      await transaction.populate('paymentMethodId', 'name code');

      return {
        success: true,
        transaction: transaction,
        callbackData: callbackData,
        statusChanged: oldStatus !== transaction.status
      };
    } catch (error) {
      console.error('Callback handling error:', error);
      throw error;
    }
  }
}

// Create singleton instance
const paymentService = new PaymentService();

// Initialize gateways from environment variables
if (process.env.EASEBUZZ_KEY && process.env.EASEBUZZ_SALT) {
  // Determine base URL based on environment or use explicit URL
  let easebuzzBaseUrl = process.env.EASEBUZZ_BASE_URL;
  if (!easebuzzBaseUrl) {
    // Auto-set based on EASEBUZZ_ENV
    if (process.env.EASEBUZZ_ENV === 'prod' || process.env.EASEBUZZ_ENV === 'production') {
      easebuzzBaseUrl = 'https://pay.easebuzz.in';
    } else {
      easebuzzBaseUrl = 'https://testpay.easebuzz.in';
    }
  }
  
  // Trim key and salt to avoid whitespace issues
  const key = process.env.EASEBUZZ_KEY.trim();
  const salt = process.env.EASEBUZZ_SALT.trim();
  
  paymentService.initializeGateway('easebuzz', {
    key: key,
    salt: salt,
    baseUrl: easebuzzBaseUrl
  });
  
  console.log('Easebuzz gateway initialized:', {
    key: key ? `${key.substring(0, 4)}...` : 'MISSING',
    keyLength: key.length,
    baseUrl: easebuzzBaseUrl
  });
}

// Initialize UPI Gateway using EKQR API (matching the provided code structure)
if (process.env.EKQR_KEY) {
  paymentService.initializeGateway('upigateway', {
    key: process.env.EKQR_KEY.trim(),
    baseUrl: process.env.UPIGATEWAY_BASE_URL || 'https://api.ekqr.in/api'
  });
  
  console.log('UPI Gateway (EKQR) initialized:', {
    key: process.env.EKQR_KEY ? `${process.env.EKQR_KEY.substring(0, 8)}...` : 'MISSING',
    baseUrl: process.env.UPIGATEWAY_BASE_URL || 'https://api.ekqr.in/api'
  });
}

module.exports = paymentService;

