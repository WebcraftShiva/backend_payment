const axios = require('axios');

const UPI_API_URL = 'https://api.ekqr.in/api';

class UPIGateway {
  constructor(config) {
    this.key = config.key || process.env.EKQR_KEY;
    this.baseUrl = config.baseUrl || UPI_API_URL;
  }

  /**
   * Create payment link (UPI Gateway using EKQR API)
   */
  async createPayment(paymentData) {
    try {
      const {
        amount,
        transactionId,
        client_txn_id,
        txnid,
        productInfo,
        productinfo,
        p_info,
        firstName,
        firstname,
        customerName,
        customer_name,
        email,
        customerEmail,
        customer_email,
        phone,
        customerPhone,
        customer_mobile,
        returnUrl,
        redirect_url,
        successUrl,
        surl,
        failureUrl,
        furl,
        failure_redirect_url,
        udf1,
        udf2,
        udf3
      } = paymentData;

      // Validate required fields
      if (!amount) {
        throw new Error('Amount is required for UPI payment');
      }
      if (!this.key) {
        throw new Error('EKQR_KEY is not configured');
      }

      // Use client_txn_id or transactionId or txnid
      const finalClientTxnId = client_txn_id || transactionId || txnid || `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      
      // Ensure amount is a string as per API requirement
      const amountStr = amount.toString();
      
      // Use redirect_url from paymentData, fallback to payment/status if not provided
      const finalRedirectUrl = redirect_url || returnUrl || successUrl || surl || '/payment/status';
      
      // Build payload matching the provided code structure
      const payload = {
        key: this.key.trim(),
        client_txn_id: finalClientTxnId,
        amount: amountStr,
        p_info: p_info || productinfo || productInfo || 'Payment',
        customer_name: customer_name || customerName || firstname || firstName || 'Customer',
        customer_email: customer_email || customerEmail || email || '',
        customer_mobile: customer_mobile || customerPhone || phone || '',
        redirect_url: finalRedirectUrl,
        udf1: udf1 || '',
        udf2: udf2 || '',
        udf3: udf3 || ''
      };

      // Validate required fields
      if (!payload.customer_email) {
        throw new Error('Email (customer_email/email) is required for UPI payment');
      }

      console.log('Sending UPI payment request:', JSON.stringify(payload, null, 2));
      
      const response = await axios.post(
        `${this.baseUrl}/create_order`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000 // 30 seconds timeout
        }
      );

      console.log('UPI payment response:', JSON.stringify(response.data, null, 2));
      
      if (!response.data.status) {
        const errorMsg = response.data.msg || 'Failed to create UPI order';
        throw new Error(errorMsg);
      }
      
      // Extract payment URL from response
      const paymentUrl = response.data.data?.payment_url || 
                        response.data.payment_url || 
                        response.data.data?.upi_url ||
                        response.data.upi_url ||
                        null;

      if (!paymentUrl) {
        throw new Error('Payment URL not received from UPI gateway');
      }

      // Add client_txn_id to the response data
      const orderId = finalClientTxnId;

      return {
        success: true,
        status: true,
        data: {
          order_id: orderId,
          payment_url: paymentUrl,
          client_txn_id: orderId
        },
        msg: 'Payment initiated successfully',
        paymentLink: paymentUrl,
        orderId: orderId,
        transactionId: finalClientTxnId,
        rawResponse: response.data
      };
    } catch (error) {
      console.error('UPI Gateway payment creation error:', error);
      const errorMessage = error.response 
        ? `Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        : error.message;
      
      return {
        success: false,
        status: false,
        error: errorMessage,
        msg: `UPI payment failed: ${errorMessage}`
      };
    }
  }

  /**
   * Check payment status (UPI Gateway using EKQR API)
   */
  async checkPaymentStatus(transactionId, txn_date = null) {
    try {
      const client_txn_id = transactionId;
      
      const payload = {
        key: this.key.trim(),
        client_txn_id,
      };

      // Add txn_date if provided
      if (txn_date) {
        payload.txn_date = txn_date;
      }

      console.log('Checking UPI order status:', JSON.stringify(payload, null, 2));
      
      const response = await axios.post(
        `${this.baseUrl}/check_order_status`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 15000 // 15 seconds timeout
        }
      );

      console.log('UPI order status response:', JSON.stringify(response.data, null, 2));
      
      if (!response.data.status) {
        const errorMsg = response.data.msg || 'Failed to check order status';
        throw new Error(errorMsg);
      }

      return {
        success: true,
        status: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error in checkOrderStatus:', error);
      const errorMessage = error.response 
        ? `Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        : error.message;
      
      return {
        success: false,
        status: false,
        error: `Failed to check UPI order status: ${errorMessage}`
      };
    }
  }

  /**
   * Handle webhook/callback response
   */
  handleCallback(callbackData) {
    try {
      const {
        client_txn_id,
        order_id,
        amount,
        status,
        ...otherData
      } = callbackData;

      // Use client_txn_id or order_id
      const transactionId = client_txn_id || order_id;

      return {
        success: true,
        transactionId: transactionId,
        amount: parseFloat(amount),
        status: status === 'success' || status === 'completed' || status === 'paid' ? 'success' : 'failed',
        data: callbackData
      };
    } catch (error) {
      console.error('UPI Gateway callback handling error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = UPIGateway;

