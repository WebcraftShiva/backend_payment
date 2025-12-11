const axios = require('axios');
const sha512 = require('js-sha512');

class EasebuzzGateway {
  constructor(config) {
    // Trim key and salt to avoid whitespace issues
    this.key = (config.key || '').trim();
    this.salt = (config.salt || '').trim();
    this.baseUrl = config.baseUrl || 'https://testpay.easebuzz.in';
    this.action = config.action || 'payment/initiateLink';
  }

  /**
   * Generate hash for Easebuzz
   * Format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt
   */
  generateHash(data, key, salt) {
    const hashstring = `${key}|${data.txnid}|${data.amount}|${data.productinfo}|${data.firstname}|${data.email}|${data.udf1 || ''}|${data.udf2 || ''}|${data.udf3 || ''}|${data.udf4 || ''}|${data.udf5 || ''}|${data.udf6 || ''}|${data.udf7 || ''}|${data.udf8 || ''}|${data.udf9 || ''}|${data.udf10 || ''}|${salt}`;
    return sha512.sha512(hashstring);
  }

  /**
   * Verify hash from Easebuzz response (reverse hash)
   * Format: salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
   */
  verifyHash(response, receivedHash) {
    if (!receivedHash) {
      console.warn('No hash received in callback data');
      return false;
    }

    // Trim key and salt to avoid whitespace issues
    const trimmedKey = (this.key || '').trim();
    const trimmedSalt = (this.salt || '').trim();

    // Build hash string with all fields
    const hashstring = `${trimmedSalt}|${response.status || ''}|${response.udf10 || ''}|${response.udf9 || ''}|${response.udf8 || ''}|${response.udf7 || ''}|${response.udf6 || ''}|${response.udf5 || ''}|${response.udf4 || ''}|${response.udf3 || ''}|${response.udf2 || ''}|${response.udf1 || ''}|${response.email || ''}|${response.firstname || ''}|${response.productinfo || ''}|${response.amount || ''}|${response.txnid || ''}|${trimmedKey}`;
    
    const generatedHash = sha512.sha512(hashstring);
    const isValid = generatedHash.toLowerCase() === receivedHash.toLowerCase();

    if (!isValid) {
      console.warn('Hash verification failed:', {
        receivedHash: receivedHash ? `${receivedHash.substring(0, 10)}...` : 'MISSING',
        generatedHash: `${generatedHash.substring(0, 10)}...`,
        hashString: hashstring.substring(0, 100) + '...',
        responseFields: {
          status: response.status,
          txnid: response.txnid,
          amount: response.amount,
          email: response.email,
          firstname: response.firstname,
          productinfo: response.productinfo
        }
      });
    }

    return isValid;
  }

  /**
   * Create payment link
   */
  async createPayment(paymentData) {
    try {
      const {
        amount,
        transactionId,
        txnid,
        productInfo,
        productinfo,
        firstName,
        firstname,
        email,
        phone,
        successUrl,
        surl,
        returnUrl,
        failureUrl,
        furl,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
        udf6,
        udf7,
        address1,
        address2,
        city,
        state,
        country,
        zipcode,
        show_payment_mode,
        split_payments,
        request_flow,
        sub_merchant_id,
        payment_category,
        account_no,
        ifsc,
        unique_id
      } = paymentData;

      // Validate required fields
      if (!amount) {
        throw new Error('Missing required field: amount');
      }
      
      // Validate key and salt
      if (!this.key || !this.key.trim()) {
        throw new Error('Easebuzz key is not configured');
      }
      if (!this.salt || !this.salt.trim()) {
        throw new Error('Easebuzz salt is not configured');
      }

      // Generate transaction ID if not provided
      const finalTxnId = txnid || transactionId || `TXN${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Validate required fields
      if (!email) {
        throw new Error('Email is required for Easebuzz payment');
      }

      // Easebuzz requires surl and furl - provide defaults if not specified
      let finalSurl = surl || successUrl || returnUrl || paymentData.redirect_url || '';
      
      if (!finalSurl || finalSurl.trim() === '') {
        throw new Error('Success URL (surl/redirect_url/successUrl/returnUrl) is required for Easebuzz payment');
      }
      
      // Add txnid parameter to success URL
      try {
        const successUrlObj = new URL(finalSurl);
        successUrlObj.searchParams.set('txnid', finalTxnId);
        finalSurl = successUrlObj.toString();
      } catch (urlError) {
        // If success URL is not a valid URL, try to append ?txnid=...
        finalSurl = finalSurl + (finalSurl.includes('?') ? '&' : '?') + `txnid=${finalTxnId}`;
      }
      
      // For furl, use provided value or default to success URL with failure parameter
      let finalFurl = furl || failureUrl || paymentData.failure_redirect_url || '';
      
      // If no failure URL provided, create one based on success URL
      if (!finalFurl || finalFurl.trim() === '') {
        try {
          const successUrlObj = new URL(surl || successUrl || returnUrl || paymentData.redirect_url || '');
          // Add status=failure and txnid parameters to the failure URL
          successUrlObj.searchParams.set('status', 'failure');
          successUrlObj.searchParams.set('txnid', finalTxnId);
          finalFurl = successUrlObj.toString();
        } catch (urlError) {
          // If success URL is not a valid URL, try to append ?status=failure&txnid=...
          const baseUrl = surl || successUrl || returnUrl || paymentData.redirect_url || '';
          finalFurl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + `status=failure&txnid=${finalTxnId}`;
        }
      } else {
        // Add txnid parameter to provided failure URL
        try {
          const failureUrlObj = new URL(finalFurl);
          failureUrlObj.searchParams.set('txnid', finalTxnId);
          finalFurl = failureUrlObj.toString();
        } catch (urlError) {
          // If failure URL is not a valid URL, try to append &txnid=...
          finalFurl = finalFurl + (finalFurl.includes('?') ? '&' : '?') + `txnid=${finalTxnId}`;
        }
      }
      
      // Validate URLs are proper URLs
      try {
        new URL(finalSurl);
        new URL(finalFurl);
      } catch (urlError) {
        throw new Error('Invalid URL format for success or failure URL');
      }

      // Build payment parameters according to Easebuzz API format
      // Must match exact format: key, txnid, amount, productinfo, firstname, phone, email, surl, furl, hash, udf1-udf10
      const paymentParams = {
        txnid: finalTxnId,
        amount: typeof amount === 'string' ? parseFloat(amount).toFixed(2) : parseFloat(amount).toFixed(2),
        productinfo: productinfo || productInfo || 'Payment',
        firstname: firstname || firstName || 'Customer',
        phone: phone || '',
        email: email || '',
        surl: finalSurl,
        furl: finalFurl,
        udf1: udf1 || '',
        udf2: udf2 || '',
        udf3: udf3 || '',
        udf4: udf4 || '',
        udf5: udf5 || '',
        udf6: udf6 || '',
        udf7: udf7 || '',
        udf8: paymentData.udf8 || '',
        udf9: paymentData.udf9 || '',
        udf10: paymentData.udf10 || ''
      };

      // Add optional fields if provided
      if (address1) paymentParams.address1 = address1;
      if (address2) paymentParams.address2 = address2;
      if (city) paymentParams.city = city;
      if (state) paymentParams.state = state;
      if (country) paymentParams.country = country;
      if (zipcode) paymentParams.zipcode = zipcode;
      if (show_payment_mode !== undefined) paymentParams.show_payment_mode = show_payment_mode;
      if (split_payments) paymentParams.split_payments = split_payments;
      if (request_flow) paymentParams.request_flow = request_flow;
      if (sub_merchant_id) paymentParams.sub_merchant_id = sub_merchant_id;
      if (payment_category) paymentParams.payment_category = payment_category;
      if (account_no) paymentParams.account_no = account_no;
      if (ifsc) paymentParams.ifsc = ifsc;
      if (unique_id) paymentParams.unique_id = unique_id;

      // Trim key and salt to ensure no whitespace issues
      const trimmedKey = (this.key || '').trim();
      const trimmedSalt = (this.salt || '').trim();
      
      if (!trimmedKey) {
        throw new Error('Easebuzz key is empty or not configured');
      }
      if (!trimmedSalt) {
        throw new Error('Easebuzz salt is empty or not configured');
      }

      // Generate hash using the exact format from existing backend
      // Format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt
      // Note: hash is calculated with trimmed key and salt
      const hash = this.generateHash(paymentParams, trimmedKey, trimmedSalt);
      
      // Add key and hash to form data
      const form = {
        key: trimmedKey,
        ...paymentParams,
        hash: hash
      };

      console.log('Easebuzz Payment Request:', {
        key: trimmedKey ? `${trimmedKey.substring(0, 4)}...` : 'MISSING',
        keyLength: trimmedKey.length,
        txnid: paymentParams.txnid,
        amount: paymentParams.amount,
        email: paymentParams.email,
        surl: paymentParams.surl,
        furl: paymentParams.furl,
        hasHash: !!hash
      });

      // Make API call to Easebuzz
      // Try different endpoints based on Easebuzz API version
      let response;
      let paymentUrl = null;
      let errorMessage = null;

      // Easebuzz API requires form-urlencoded format
      const formData = new URLSearchParams(form).toString();

      try {
        // Make API call to Easebuzz using form-urlencoded
        const callUrl = `${this.baseUrl}/payment/initiateLink`;
        response = await axios.post(
          callUrl,
          formData,
          {
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        console.log('Easebuzz API Response:', JSON.stringify(response.data, null, 2));

        // Handle Easebuzz response format
        // Response format: { status: 1, data: "payment_id", ... } or { status: 0, error_desc: "..." }
        if (response.data) {
          if (response.data.status === 1) {
            // Payment URL is constructed as: baseUrl + "/pay/" + response.data.data
            const paymentId = response.data.data;
            // Ensure baseUrl doesn't have trailing slash
            const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
            paymentUrl = `${baseUrl}/pay/${paymentId}`;
            
            // Store the payment ID as gateway transaction ID for later retrieval
            // Note: The txnid we sent is what Easebuzz uses for transaction lookup
            console.log('Easebuzz payment created:', {
              txnid: finalTxnId,
              paymentId: paymentId,
              paymentUrl: paymentUrl
            });
          } else {
            errorMessage = response.data.error_desc || response.data.msg || response.data.message || 'Payment link not received';
          }
        }
      } catch (apiError) {
        console.error('Easebuzz API Error:', apiError.response?.data || apiError.message);
        const errorData = apiError.response?.data;
        errorMessage = errorData?.error_desc || 
                      errorData?.msg || 
                      errorData?.message || 
                      errorData?.error ||
                      (typeof errorData === 'string' ? errorData : JSON.stringify(errorData)) ||
                      apiError.message;
        throw new Error(errorMessage);
      }

      if (!paymentUrl && errorMessage) {
        throw new Error(errorMessage);
      }

      if (!paymentUrl) {
        throw new Error('Payment link not received from gateway');
      }

      // Extract order_id/transaction_id from response or use the one we sent
      // The txnid we sent to Easebuzz is what should be used for transaction retrieval
      const orderId = finalTxnId;
      const paymentId = response.data?.data; // This is the payment ID from Easebuzz

      return {
        success: true,
        status: true,
        data: {
          order_id: orderId,
          payment_url: paymentUrl,
          client_txn_id: orderId,
          payment_id: paymentId // Store payment ID for reference
        },
        msg: 'Payment initiated successfully',
        paymentLink: paymentUrl,
        orderId: orderId,
        transactionId: finalTxnId,
        gatewayTransactionId: paymentId, // Store payment ID as gateway transaction ID
        rawResponse: response.data
      };
    } catch (error) {
      console.error('Easebuzz payment creation error:', error);
      const errorMsg = error.response?.data?.msg || error.response?.data?.message || error.response?.data || error.message;
      return {
        success: false,
        status: false,
        error: errorMsg,
        msg: errorMsg
      };
    }
  }

  /**
   * Check payment status and get transaction details from Easebuzz dashboard API
   * @param {string} transactionId - Transaction ID
   * @param {Object} transactionData - Transaction data from database (optional, will be fetched if not provided)
   */
  async checkPaymentStatus(transactionId, transactionData = null) {
    try {
      // Get transaction data if not provided
      let transaction = transactionData;
      let email = null;
      let phone = null;
      let amount = null;

      if (transaction) {
        // Extract email and phone from transaction data
        const paymentRequest = transaction.paymentRequest ? Object.fromEntries(transaction.paymentRequest) : {};
        email = paymentRequest.email || transaction.userId?.email || '';
        phone = paymentRequest.phone || '';
        amount = transaction.amount;
      }

      // If email or phone not available, we need them for the API call
      if (!email || !phone) {
        throw new Error('Email and phone are required for Easebuzz transaction retrieval. Please ensure transaction data is provided.');
      }

      // Validate phone number (must be 10 digits as per Easebuzz requirement)
      const phoneStr = phone.toString().trim().replace(/\D/g, ''); // Remove non-digits
      if (phoneStr.length !== 10) {
        throw new Error('Phone number must be exactly 10 digits');
      }

      // Determine dashboard URL based on environment
      const env = (process.env.EASEBUZZ_ENV || 'test').toLowerCase();
      const dashboardUrl = env === 'prod' || env === 'production' 
        ? 'https://dashboard.easebuzz.in' 
        : 'https://dashboard.easebuzz.in';

      // Prepare form data - use decimal amount format
      const amountStr = amount ? parseFloat(amount).toFixed(2) : '0.00';
      const trimmedKey = (this.key || '').trim();
      const trimmedSalt = (this.salt || '').trim();
      const trimmedTxnId = transactionId.trim();
      const trimmedEmail = email.trim().toLowerCase();

      // Generate hash: key|txnid|salt
      const hashString = `${trimmedKey}|${trimmedTxnId}|${trimmedSalt}`;
      const hash = sha512.sha512(hashString);

      const formData = {
        key: trimmedKey,
        txnid: trimmedTxnId,
        amount: amountStr,
        email: trimmedEmail,
        phone: phoneStr,
        hash: hash
      };

      console.log('Easebuzz transaction retrieval request:', {
        txnid: trimmedTxnId,
        email: trimmedEmail,
        phone: phoneStr ? `${phoneStr.substring(0, 3)}***${phoneStr.substring(7)}` : 'MISSING',
        amount: amountStr,
        dashboardUrl
      });

      // Make request to dashboard API
      // Try v1 first (as per CURL), fallback to v2.1
      let response;
      let transactionDetails = null;

      try {
        // Try v1 endpoint first
        response = await axios.post(
          `${dashboardUrl}/transaction/v1/retrieve`,
          new URLSearchParams(formData).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            timeout: 15000
          }
        );

        // Handle response format
        if (response.data && response.data.msg && Array.isArray(response.data.msg) && response.data.msg.length > 0) {
          transactionDetails = response.data.msg[0];
        } else if (response.data) {
          transactionDetails = response.data;
        }
      } catch (v1Error) {
        // If v1 fails, try v2.1
        console.log('v1 endpoint failed, trying v2.1:', v1Error.message);
        try {
          response = await axios.post(
            `${dashboardUrl}/transaction/v2.1/retrieve`,
            new URLSearchParams(formData).toString(),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
              },
              timeout: 15000
            }
          );

          if (response.data && response.data.msg && Array.isArray(response.data.msg) && response.data.msg.length > 0) {
            transactionDetails = response.data.msg[0];
          } else if (response.data) {
            transactionDetails = response.data;
          }
        } catch (v2Error) {
          throw new Error(`Both v1 and v2.1 endpoints failed. v1: ${v1Error.message}, v2.1: ${v2Error.message}`);
        }
      }

      if (!transactionDetails) {
        throw new Error('No transaction details received from Easebuzz API');
      }

      console.log('Easebuzz transaction details retrieved:', {
        txnid: transactionDetails.txnid || transactionDetails.transaction_id,
        status: transactionDetails.status || transactionDetails.payment_status,
        amount: transactionDetails.amount
      });

      return {
        success: true,
        data: transactionDetails,
        transactionDetails: transactionDetails
      };
    } catch (error) {
      console.error('Easebuzz transaction retrieval error:', {
        message: error.message,
        response: error.response?.data,
        url: error.config?.url
      });
      return {
        success: false,
        error: error.response?.data || error.message,
        transactionDetails: null
      };
    }
  }

  /**
   * Retrieve transaction details from Easebuzz dashboard API (simplified version)
   * Hash format: key|txnid|salt
   * @param {string} txnid - Transaction ID
   */
  async retrieveTransactionDetails(txnid) {
    try {
      if (!txnid) {
        throw new Error('Transaction ID (txnid) is required');
      }

      // Determine dashboard URL based on environment
      // Note: Dashboard URL is different from payment URL
      const env = (process.env.EASEBUZZ_ENV || 'test').toLowerCase();
      const dashboardUrl = env === 'prod' || env === 'production' 
        ? 'https://dashboard.easebuzz.in' 
        : 'https://dashboard.easebuzz.in';

      // Trim key, salt, and txnid
      const trimmedKey = (this.key || '').trim();
      const trimmedSalt = (this.salt || '').trim();
      const trimmedTxnId = txnid.trim();

      if (!trimmedKey || !trimmedSalt) {
        throw new Error('Easebuzz key and salt must be configured');
      }

      // Generate hash: key|txnid|salt (as per CURL documentation)
      // Note: Some Easebuzz APIs use salt|txnid|key, but v2.1 retrieve uses key|txnid|salt
      const hashString = `${trimmedKey}|${trimmedTxnId}|${trimmedSalt}`;
      const hash = sha512.sha512(hashString);

      const formData = {
        key: trimmedKey,
        txnid: trimmedTxnId,
        hash: hash
      };

      console.log('Easebuzz retrieve transaction request:', {
        key: trimmedKey ? `${trimmedKey.substring(0, 4)}...` : 'MISSING',
        keyLength: trimmedKey.length,
        txnid: trimmedTxnId,
        salt: trimmedSalt ? `${trimmedSalt.substring(0, 4)}...` : 'MISSING',
        saltLength: trimmedSalt.length,
        hashString: `${trimmedKey.substring(0, 4)}...|${trimmedTxnId}|${trimmedSalt.substring(0, 4)}...`,
        hash: hash ? `${hash.substring(0, 20)}...` : 'MISSING',
        dashboardUrl
      });

      // Make request to dashboard API v2.1
      const requestUrl = `${dashboardUrl}/transaction/v2.1/retrieve`;
      const requestData = new URLSearchParams(formData).toString();
      
      console.log('Making request to:', requestUrl);
      console.log('Request data (without sensitive info):', {
        key: trimmedKey ? `${trimmedKey.substring(0, 4)}...` : 'MISSING',
        txnid: trimmedTxnId,
        hash: hash ? `${hash.substring(0, 20)}...` : 'MISSING'
      });

      const response = await axios.post(
        requestUrl,
        requestData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );

      // Handle response format
      let transactionDetails = null;
      if (response.data && response.data.msg && Array.isArray(response.data.msg) && response.data.msg.length > 0) {
        transactionDetails = response.data.msg[0];
      } else if (response.data && response.data.msg && typeof response.data.msg === 'object') {
        transactionDetails = response.data.msg;
      } else if (response.data) {
        transactionDetails = response.data;
      }

      if (!transactionDetails) {
        throw new Error('No transaction details received from Easebuzz API');
      }

      console.log('Easebuzz transaction details retrieved:', {
        txnid: transactionDetails.txnid || transactionDetails.transaction_id,
        status: transactionDetails.status || transactionDetails.payment_status
      });

      return {
        success: true,
        data: transactionDetails,
        transactionDetails: transactionDetails
      };
    } catch (error) {
      console.error('Easebuzz transaction retrieval error:', {
        message: error.message,
        response: error.response?.data,
        url: error.config?.url
      });
      const errorResponse = error.response?.data;
      
      // Provide more helpful error message
      let errorMessage = error.message;
      if (errorResponse) {
        if (errorResponse.error_desc) {
          errorMessage = errorResponse.error_desc;
        } else if (errorResponse.message) {
          errorMessage = errorResponse.message;
        } else if (typeof errorResponse === 'object') {
          errorMessage = JSON.stringify(errorResponse);
        }
      }
      
      // Check if it's a hash/key validation error
      if (errorMessage && (errorMessage.includes('Invalid key') || errorMessage.includes('cannot find associated transaction'))) {
        errorMessage += ' Please verify: 1) The transaction ID (txnid) matches the one sent to Easebuzz during payment creation, 2) The EASEBUZZ_KEY and EASEBUZZ_SALT are correct, 3) The transaction exists in Easebuzz dashboard, 4) You are using the correct environment (test/prod).';
      }
      
      return {
        success: false,
        error: errorResponse || errorMessage,
        transactionDetails: null,
        errorDetails: {
          message: errorMessage,
          status: error.response?.status,
          response: errorResponse,
          txnid: trimmedTxnId,
          key: trimmedKey ? `${trimmedKey.substring(0, 4)}...` : 'MISSING'
        }
      };
    }
  }

  /**
   * Retrieve transactions by date range from Easebuzz dashboard API (v2)
   * Hash format: key|merchant_email|start_date|end_date|salt
   * Merchant email is read from EASEBUZZ_MERCHANT_EMAIL environment variable
   * @param {string} startDate - Start date in format dd-mm-yyyy
   * @param {string} endDate - End date in format dd-mm-yyyy
   */
  async retrieveTransactionsByDateRange(startDate, endDate) {
    try {
      if (!startDate) {
        throw new Error('Start date is required');
      }
      if (!endDate) {
        throw new Error('End date is required');
      }

      // Get merchant email from environment variable
      const merchantEmail = (process.env.EASEBUZZ_MERCHANT_EMAIL || '').trim();
      if (!merchantEmail) {
        throw new Error('EASEBUZZ_MERCHANT_EMAIL environment variable is required');
      }

      // Always use production dashboard URL
      const dashboardUrl = 'https://dashboard.easebuzz.in';
      
      console.log('Using dashboard URL:', dashboardUrl);

      // Trim key, salt, and other parameters
      const trimmedKey = (this.key || '').trim();
      const trimmedSalt = (this.salt || '').trim();
      const trimmedStartDate = startDate.trim();
      const trimmedEndDate = endDate.trim();
      const trimmedEmail = merchantEmail.toLowerCase();

      // Validate date format (dd-mm-yyyy)
      const datePattern = /^(\d{2})-(\d{2})-(\d{4})$/;
      if (!datePattern.test(trimmedStartDate)) {
        throw new Error('Start date must be in dd-mm-yyyy format (e.g., 10-05-2024)');
      }
      if (!datePattern.test(trimmedEndDate)) {
        throw new Error('End date must be in dd-mm-yyyy format (e.g., 23-08-2024)');
      }

      // Validate that end_date >= start_date
      const startParts = trimmedStartDate.split('-');
      const endParts = trimmedEndDate.split('-');
      const startDateObj = new Date(`${startParts[2]}-${startParts[1]}-${startParts[0]}`);
      const endDateObj = new Date(`${endParts[2]}-${endParts[1]}-${endParts[0]}`);
      
      if (endDateObj < startDateObj) {
        throw new Error('End date must be greater than or equal to start date');
      }

      if (!trimmedKey || !trimmedSalt) {
        throw new Error('Easebuzz key and salt must be configured');
      }

      // Build request payload
      const requestPayload = {
        key: trimmedKey,
        merchant_email: trimmedEmail,
        date_range: {
          start_date: trimmedStartDate,
          end_date: trimmedEndDate
        }
      };

      // Generate hash: key|merchant_email|start_date|end_date|salt
      const hashString = `${trimmedKey}|${trimmedEmail}|${trimmedStartDate}|${trimmedEndDate}|${trimmedSalt}`;
      const hash = sha512.sha512(hashString);
      requestPayload.hash = hash;

      console.log('Easebuzz retrieve transactions by date range request:', {
        merchant_key: trimmedKey ? `${trimmedKey.substring(0, 4)}...` : 'MISSING',
        start_date: trimmedStartDate,
        end_date: trimmedEndDate,
        merchant_email: trimmedEmail ? `${trimmedEmail.substring(0, 3)}***${trimmedEmail.substring(trimmedEmail.indexOf('@'))}` : 'MISSING',
        hashString: `${trimmedKey.substring(0, 4)}...|${trimmedEmail.substring(0, 3)}***|${trimmedStartDate}|${trimmedEndDate}|${trimmedSalt.substring(0, 4)}...`,
        hashFormat: 'key|merchant_email|start_date|end_date|salt',
        hashGenerated: !!hash,
        hashPreview: hash ? `${hash.substring(0, 20)}...` : 'MISSING',
        dashboardUrl
      });

      // Make request to dashboard API v2/retrieve/date (JSON format)
      const requestUrl = `${dashboardUrl}/transaction/v2/retrieve/date`;
      
      console.log('Making request to:', requestUrl);
      console.log('Request payload (without sensitive data):', {
        key: trimmedKey ? `${trimmedKey.substring(0, 4)}...` : 'MISSING',
        merchant_email: trimmedEmail ? `${trimmedEmail.substring(0, 3)}***${trimmedEmail.substring(trimmedEmail.indexOf('@'))}` : 'MISSING',
        date_range: requestPayload.date_range,
        hasHash: !!requestPayload.hash
      });

      const response = await axios.post(
        requestUrl,
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );

      // Handle response format
      let transactions = null;
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        transactions = response.data.data;
      } else if (response.data && response.data.msg && Array.isArray(response.data.msg)) {
        transactions = response.data.msg;
      } else if (response.data && Array.isArray(response.data)) {
        transactions = response.data;
      } else if (response.data) {
        transactions = response.data;
      }

      return {
        success: true,
        data: transactions || [],
        transactions: Array.isArray(transactions) ? transactions : (transactions ? [transactions] : []),
        count: Array.isArray(transactions) ? transactions.length : (transactions ? 1 : 0),
        pagination: response.data?.pagination || response.data?.next || null,
        rawResponse: response.data
      };
    } catch (error) {
      const errorResponse = error.response?.data;
      console.error('Easebuzz retrieve transactions by date range error:', {
        message: error.message,
        response: errorResponse,
        url: error.config?.url,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // Provide more helpful error message
      let errorMessage = error.message;
      if (errorResponse) {
        if (errorResponse.error_desc) {
          errorMessage = errorResponse.error_desc;
        } else if (errorResponse.message) {
          errorMessage = errorResponse.message;
        } else if (typeof errorResponse === 'object') {
          errorMessage = JSON.stringify(errorResponse);
        }
      }
      
      return {
        success: false,
        error: errorResponse || errorMessage,
        transactions: null,
        errorDetails: {
          message: errorMessage,
          status: error.response?.status,
          response: errorResponse
        }
      };
    }
  }

  /**
   * Retrieve transactions by date from Easebuzz dashboard API
   * Hash format: merchant_key|transaction_date|merchant_email|salt
   * Merchant email is read from EASEBUZZ_MERCHANT_EMAIL environment variable
   * @param {string} transactionDate - Transaction date in format dd-mm-yyyy
   */
  async retrieveTransactionsByDate(transactionDate) {
    try {
      if (!transactionDate) {
        throw new Error('Transaction date is required');
      }

      // Get merchant email from environment variable
      const merchantEmail = (process.env.EASEBUZZ_MERCHANT_EMAIL || '').trim();
      if (!merchantEmail) {
        throw new Error('EASEBUZZ_MERCHANT_EMAIL environment variable is required');
      }

      // Always use production dashboard URL
      const dashboardUrl = 'https://dashboard.easebuzz.in/';
      
      console.log('Using dashboard URL:', dashboardUrl);

      // Trim key, salt, and other parameters
      const trimmedKey = (this.key || '').trim();
      const trimmedSalt = (this.salt || '').trim();
      const trimmedDate = transactionDate.trim();
      const trimmedEmail = merchantEmail.toLowerCase();

      // Validate date format (dd-mm-yyyy)
      const datePattern = /^(\d{2})-(\d{2})-(\d{4})$/;
      if (!datePattern.test(trimmedDate)) {
        throw new Error('Transaction date must be in dd-mm-yyyy format (e.g., 15-01-2024)');
      }

      if (!trimmedKey || !trimmedSalt) {
        throw new Error('Easebuzz key and salt must be configured');
      }

      // URL encode the transaction date for the request
      const encodedDate = encodeURIComponent(trimmedDate);

      // Generate hash: key|merchant_email|transaction_date|salt
      // Format as per Easebuzz API documentation
      const hashString = `${trimmedKey}|${trimmedEmail}|${encodedDate}|${trimmedSalt}`;
      const hash = sha512.sha512(hashString);

      const formData = {
        merchant_key: trimmedKey,
        transaction_date: encodedDate, // Send URL-encoded date
        merchant_email: trimmedEmail,
        hash: hash
      };

      console.log('Easebuzz retrieve transactions by date request:', {
        merchant_key: trimmedKey ? `${trimmedKey.substring(0, 4)}...` : 'MISSING',
        transaction_date: trimmedDate,
        transaction_date_encoded: encodedDate,
        merchant_email: trimmedEmail ? `${trimmedEmail.substring(0, 3)}***${trimmedEmail.substring(trimmedEmail.indexOf('@'))}` : 'MISSING',
        hashString: `${trimmedKey.substring(0, 4)}...|${trimmedEmail.substring(0, 3)}***|${encodedDate}|${trimmedSalt.substring(0, 4)}...`,
        hashFormat: 'key|merchant_email|transaction_date|salt',
        hashGenerated: !!hash,
        hashPreview: hash ? `${hash}` : 'MISSING',
        note: 'Hash format: key|merchant_email|transaction_date(URL-encoded)|salt',
        dashboardUrl
      });

      // Make request to dashboard API v1/retrieve/date
      // URLSearchParams automatically URL-encodes all values
      const requestUrl = `${dashboardUrl}/transaction/v1/retrieve/date`;
      const requestData = new URLSearchParams(formData).toString();
      
      console.log('Request data (URL-encoded by URLSearchParams):', {
        preview: requestData.substring(0, 100) + '...'
      });
      
      console.log('Making request to:', requestUrl);

      const response = await axios.post(
        requestUrl,
        requestData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          timeout: 15000
        }
      );

      // Handle response format
      let transactions = null;
      if (response.data && response.data.msg && Array.isArray(response.data.msg)) {
        transactions = response.data.msg;
      } else if (response.data && response.data.msg && typeof response.data.msg === 'object') {
        transactions = [response.data.msg];
      } else if (response.data && Array.isArray(response.data)) {
        transactions = response.data;
      } else if (response.data) {
        transactions = response.data;
      }

      if (!transactions) {
        throw new Error('No transaction data received from Easebuzz API');
      }

      console.log('Easebuzz transactions by date retrieved:', {
        date: trimmedDate,
        count: Array.isArray(transactions) ? transactions.length : 1
      });

      return {
        success: true,
        data: transactions,
        transactions: Array.isArray(transactions) ? transactions : [transactions],
        count: Array.isArray(transactions) ? transactions.length : 1
      };
    } catch (error) {
      const errorResponse = error.response?.data;
      console.error('Easebuzz retrieve transactions by date error:', {
        message: error.message,
        response: errorResponse,
        url: error.config?.url,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      // Provide more helpful error message
      let errorMessage = error.message;
      if (errorResponse) {
        if (errorResponse.error_desc) {
          errorMessage = errorResponse.error_desc;
        } else if (errorResponse.message) {
          errorMessage = errorResponse.message;
        } else if (typeof errorResponse === 'object') {
          errorMessage = JSON.stringify(errorResponse);
        }
      }
      
      return {
        success: false,
        error: errorResponse || errorMessage,
        transactions: null,
        errorDetails: {
          message: errorMessage,
          status: error.response?.status,
          response: errorResponse
        }
      };
    }
  }

  /**
   * Handle webhook/callback response
   */
  handleCallback(callbackData) {
    try {
      console.log('Easebuzz handleCallback - received data:', {
        keys: Object.keys(callbackData),
        txnid: callbackData.txnid,
        status: callbackData.status,
        hasHash: !!callbackData.hash
      });

      const {
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        status,
        hash,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
        udf6,
        udf7,
        udf8,
        udf9,
        udf10,
        ...otherData
      } = callbackData;

      // Verify hash using reverse hash format
      // Format: salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
      const responseData = {
        status: status || '',
        udf1: udf1 || '',
        udf2: udf2 || '',
        udf3: udf3 || '',
        udf4: udf4 || '',
        udf5: udf5 || '',
        udf6: udf6 || '',
        udf7: udf7 || '',
        udf8: udf8 || '',
        udf9: udf9 || '',
        udf10: udf10 || '',
        email: email || '',
        firstname: firstname || '',
        productinfo: productinfo || '',
        amount: amount || '',
        txnid: txnid || ''
      };

      // Verify hash if provided
      // In development, log warning but allow processing if hash is missing
      let isValid = true;
      if (hash) {
        isValid = this.verifyHash(responseData, hash);
        if (!isValid) {
          // In development, allow processing with warning
          if (process.env.NODE_ENV === 'development' || process.env.EASEBUZZ_ENV === 'test') {
            console.warn('⚠️ Hash verification failed, but allowing in development/test mode');
            isValid = true; // Allow in development
          } else {
            return {
              success: false,
              error: 'Invalid hash verification'
            };
          }
        }
      } else {
        console.warn('⚠️ No hash provided in callback data');
        // In production, require hash
        if (process.env.NODE_ENV === 'production' && process.env.EASEBUZZ_ENV === 'prod') {
          return {
            success: false,
            error: 'Hash is required for callback verification'
          };
        }
      }

      return {
        success: true,
        transactionId: txnid,
        amount: parseFloat(amount) || 0,
        status: status === 'success' ? 'success' : (status === 'failure' ? 'failed' : 'pending'),
        data: callbackData
      };
    } catch (error) {
      console.error('Easebuzz callback handling error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = EasebuzzGateway;


