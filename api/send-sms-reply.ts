import type { VercelRequest, VercelResponse } from '@vercel/node';

interface SendReplyPayload {
  phone: string;
  content: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const smsServiceUrl = process.env['SMS_SERVICE_URL'];
  const smsApiKey = process.env['SMS_SERVICE_API_KEY'];

  if (!smsServiceUrl || !smsApiKey) {
    console.error('SMS_SERVICE_URL or SMS_SERVICE_API_KEY not configured');
    return res.status(500).json({ success: false, error: 'SMS service not configured' });
  }

  const { phone, content }: SendReplyPayload = req.body;

  if (!phone || !content) {
    return res.status(400).json({ success: false, error: 'Missing phone or content' });
  }

  try {
    const smsRes = await fetch(`${smsServiceUrl}/send/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': smsApiKey },
      body: JSON.stringify({ to: phone, body: content }),
    });

    const data = await smsRes.json();

    if (!smsRes.ok) {
      console.error('SMS service error:', data);
      return res.status(smsRes.status).json({ success: false, error: data.detail || 'Failed to send' });
    }

    return res.json({ success: true, twilio_sid: data.twilio_sid });
  } catch (err) {
    console.error('Error calling SMS service:', err);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
