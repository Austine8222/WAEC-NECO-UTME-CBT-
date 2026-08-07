export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { reference, userId, unlockType } = await req.json();

    if (!reference || !userId || !unlockType) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Verify transaction directly with Paystack's API using your Secret Key from Netlify environment variables
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status || paystackData.data.status !== 'success') {
      return new Response(JSON.stringify({ error: 'Transaction verification failed or incomplete' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Validate amount paid (50000 kobo = ₦500, 200000 kobo = ₦2,000)
    const amountPaid = paystackData.data.amount;
    const expectedAmount = unlockType === 'all' ? 200000 : 50000;

    if (amountPaid < expectedAmount) {
      return new Response(JSON.stringify({ error: 'Invalid payment amount detected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Since we are validating server-side, we return success so your frontend can safely update UI,
    // or you can initialize Firebase Admin SDK here if you prefer server-side database writes.
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment verified securely by server.' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Payment Verification Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error during verification' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
