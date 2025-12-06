import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'confirmations@royalpawzusa.com';

interface BookingEmailData {
  booking: {
    id: string;
    scheduled_date: string;
    scheduled_time_start: string;
    scheduled_time_end: string;
    address: string;
    city: string;
    state: string;
    total_amount: number;
    service_name?: string;
  };
  client: {
    first_name: string;
    last_name: string;
    email: string;
  };
  groomer: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pets: Array<{
    name: string;
  }>;
  adminEmail?: string;
}

function generateClientEmailHTML(data: BookingEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const date = new Date(data.booking.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
    }
    .content {
      padding: 30px 20px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #1e293b;
    }
    .details-box {
      background-color: #f8fafc;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .detail-row {
      display: flex;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .detail-row:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .detail-label {
      font-weight: 600;
      color: #475569;
      width: 140px;
      flex-shrink: 0;
    }
    .detail-value {
      color: #1e293b;
      flex: 1;
    }
    .highlight {
      background-color: #dbeafe;
      border: 2px solid #3b82f6;
      padding: 15px;
      border-radius: 6px;
      margin: 20px 0;
      text-align: center;
    }
    .highlight strong {
      color: #1e40af;
      font-size: 18px;
    }
    .pet-item {
      display: inline-block;
      background-color: #e0e7ff;
      color: #4338ca;
      padding: 4px 12px;
      border-radius: 12px;
      margin-right: 8px;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px;
      text-align: center;
      color: #64748b;
      font-size: 14px;
      border-top: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Confirmed!</h1>
      <p>Your appointment is scheduled</p>
    </div>

    <div class="content">
      <div class="greeting">Hi ${data.client.first_name},</div>

      <div>
        Great news! Your grooming appointment has been confirmed. We're excited to pamper your furry friend${petNames.length > 1 ? 's' : ''}!
      </div>

      <div class="highlight">
        <strong>${date} at ${data.booking.scheduled_time_start} - ${data.booking.scheduled_time_end}</strong>
      </div>

      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${data.booking.service_name || 'Grooming Service'}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Pet${petNames.length > 1 ? 's' : ''}:</span>
          <span class="detail-value">
            ${petNames.map((name) => `<span class="pet-item">${name}</span>`).join('')}
          </span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Groomer:</span>
          <span class="detail-value">${data.groomer.first_name} ${data.groomer.last_name}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Location:</span>
          <span class="detail-value">${data.booking.address}, ${data.booking.city}, ${data.booking.state}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Total Amount:</span>
          <span class="detail-value"><strong>$${data.booking.total_amount.toFixed(2)}</strong></span>
        </div>
      </div>

      <p style="color: #475569; margin-top: 25px;">
        <strong>What to expect:</strong><br>
        - Your groomer will arrive at the scheduled time<br>
        - The grooming service will be done in our mobile van<br>
        - We'll send you before and after photos<br>
        - Payment will be processed after service completion
      </p>
    </div>

    <div class="footer">
      <p><strong>Royal Pawz Mobile Grooming</strong></p>
      <p>Bringing luxury grooming to your doorstep</p>
    </div>
  </div>
</body>
</html>
`;
}

function generateGroomerEmailHTML(data: BookingEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const date = new Date(data.booking.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; }
    .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 8px; }
    .content { padding: 20px 0; }
    .detail { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .label { font-weight: bold; color: #667eea; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>New Booking Assignment</h1>
    </div>
    <div class="content">
      <p>Hi ${data.groomer.first_name},</p>
      <p>You have been assigned a new grooming appointment:</p>

      <div class="detail">
        <div><span class="label">Date & Time:</span> ${date} at ${data.booking.scheduled_time_start} - ${data.booking.scheduled_time_end}</div>
        <div><span class="label">Client:</span> ${data.client.first_name} ${data.client.last_name}</div>
        <div><span class="label">Pet(s):</span> ${petNames.join(', ')}</div>
        <div><span class="label">Location:</span> ${data.booking.address}, ${data.booking.city}, ${data.booking.state}</div>
        <div><span class="label">Service:</span> ${data.booking.service_name || 'Grooming Service'}</div>
      </div>

      <p>Please ensure you arrive on time and have all necessary equipment ready.</p>
      <p>Good luck with your appointment!</p>
    </div>
  </div>
</body>
</html>
`;
}

function generateAdminEmailHTML(data: BookingEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const date = new Date(data.booking.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; }
    .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px; }
    .content { padding: 20px 0; }
    .detail { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .label { font-weight: bold; color: #10b981; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Approved</h1>
    </div>
    <div class="content">
      <p>A booking has been approved and assigned:</p>

      <div class="detail">
        <div><span class="label">Booking ID:</span> ${data.booking.id}</div>
        <div><span class="label">Date & Time:</span> ${date} at ${data.booking.scheduled_time_start} - ${data.booking.scheduled_time_end}</div>
        <div><span class="label">Client:</span> ${data.client.first_name} ${data.client.last_name} (${data.client.email})</div>
        <div><span class="label">Groomer:</span> ${data.groomer.first_name} ${data.groomer.last_name} (${data.groomer.email})</div>
        <div><span class="label">Pet(s):</span> ${petNames.join(', ')}</div>
        <div><span class="label">Location:</span> ${data.booking.address}, ${data.booking.city}, ${data.booking.state}</div>
        <div><span class="label">Total Amount:</span> $${data.booking.total_amount.toFixed(2)}</div>
      </div>

      <p>All parties have been notified via email.</p>
    </div>
  </div>
</body>
</html>
`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const emailData: BookingEmailData = req.body;

    if (!emailData.booking || !emailData.client || !emailData.groomer || !emailData.pets) {
      return res.status(400).json({
        success: false,
        error: 'Missing required email data'
      });
    }

    const results = await Promise.allSettled([
      // Send to client
      resend.emails.send({
        from: FROM_EMAIL,
        to: [emailData.client.email],
        subject: 'Your Royal Pawz Appointment is Confirmed!',
        html: generateClientEmailHTML(emailData),
      }),

      // Send to groomer
      resend.emails.send({
        from: FROM_EMAIL,
        to: [emailData.groomer.email],
        subject: 'New Booking Assignment - Royal Pawz',
        html: generateGroomerEmailHTML(emailData),
      }),

      // Send to admin (if provided)
      ...(emailData.adminEmail ? [
        resend.emails.send({
          from: FROM_EMAIL,
          to: [emailData.adminEmail],
          subject: 'Booking Approved - Royal Pawz Admin',
          html: generateAdminEmailHTML(emailData),
        })
      ] : [])
    ]);

    // Check results
    const failures = results.filter(r => r.status === 'rejected');

    if (failures.length > 0) {
      console.error('Some emails failed to send:', failures);
      return res.status(207).json({
        success: true,
        message: 'Some emails sent successfully, but some failed',
        results: results
      });
    }

    console.log('All booking approval emails sent successfully');
    return res.json({
      success: true,
      message: 'All emails sent successfully',
      results: results
    });

  } catch (error) {
    console.error('Error sending booking approval emails:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
