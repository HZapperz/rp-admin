import type { VercelRequest, VercelResponse } from '@vercel/node';

interface BookingSmsData {
  booking_id: string;
  user_id: string;
  client_phone: string;
  client_first_name: string;
  pet_name: string;
  scheduled_date: string;
  scheduled_time: string;
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

  const data: BookingSmsData = req.body;

  if (!data.booking_id || !data.user_id || !data.client_phone) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  let confirmed = false;
  let reminders_scheduled = false;

  // Send booking confirmed SMS
  try {
    const confirmRes = await fetch(`${smsServiceUrl}/webhooks/royalpawz/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': smsApiKey },
      body: JSON.stringify({
        event_type: 'booking.confirmed',
        recipient: {
          user_id: data.user_id,
          phone: data.client_phone,
          name: data.client_first_name,
          type: 'client',
        },
        booking_id: data.booking_id,
        data: {
          pet_name: data.pet_name,
          date: data.scheduled_date,
          time: data.scheduled_time,
        },
      }),
    });
    confirmed = confirmRes.ok;
    console.log('SMS confirmation result:', confirmRes.status);
  } catch (err) {
    console.error('Failed to send SMS confirmation:', err);
  }

  // Schedule 24h reminder + review request
  try {
    const params = new URLSearchParams({
      booking_id: data.booking_id,
      user_id: data.user_id,
      pet_name: data.pet_name,
      scheduled_date: data.scheduled_date,
      scheduled_time: data.scheduled_time,
      phone: data.client_phone,
      name: data.client_first_name,
    });
    const reminderRes = await fetch(`${smsServiceUrl}/webhooks/royalpawz/booking-created?${params}`, {
      method: 'POST',
      headers: { 'X-API-Key': smsApiKey },
    });
    reminders_scheduled = reminderRes.ok;
    console.log('SMS reminder schedule result:', reminderRes.status);
  } catch (err) {
    console.error('Failed to schedule SMS reminders:', err);
  }

  return res.json({ success: true, confirmed, reminders_scheduled });
}
