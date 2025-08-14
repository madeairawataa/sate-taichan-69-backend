const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const createInvoice = async ({
  externalID,
  payerEmail,
  description,
  amount,
  successRedirectURL,
  metadata
}) => {
  const res = await axios.post(
    'https://api.xendit.co/v2/invoices',
    {
      external_id: externalID || `inv-${uuidv4()}`,
      payer_email: payerEmail,
      description,
      amount,
      success_redirect_url: successRedirectURL || 'http://localhost:3000/status',
      currency: 'IDR',
      metadata: metadata || {}
    },
    {
      auth: {
        username: process.env.XENDIT_API_KEY,
        password: ''
      }
    }
  );

  return res.data;
};

module.exports = {
  createInvoice
};
