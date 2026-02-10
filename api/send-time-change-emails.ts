import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

// Initialize Resend only if API key exists
const RESEND_API_KEY = process.env['RESEND_API_KEY'];
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_EMAIL = process.env['FROM_EMAIL'] || 'confirmations@royalpawzusa.com';

interface TimeChangeEmailData {
  booking: {
    id: string;
    old_date: string;
    old_time_start: string;
    old_time_end: string;
    new_date: string;
    new_time_start: string;
    new_time_end: string;
    address: string;
    city: string;
    state: string;
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
  reason: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function generateClientTimeChangeHTML(data: TimeChangeEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const oldDate = formatDate(data.booking.old_date);
  const newDate = formatDate(data.booking.new_date);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Rescheduled</title>
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
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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
    .time-comparison {
      display: flex;
      gap: 20px;
      margin: 25px 0;
    }
    .time-box {
      flex: 1;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .time-box.old {
      background-color: #fef2f2;
      border: 2px solid #fecaca;
    }
    .time-box.new {
      background-color: #ecfdf5;
      border: 2px solid #6ee7b7;
    }
    .time-box h3 {
      margin: 0 0 10px 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .time-box.old h3 {
      color: #dc2626;
    }
    .time-box.new h3 {
      color: #059669;
    }
    .time-box .date {
      font-weight: 600;
      font-size: 16px;
      color: #1e293b;
    }
    .time-box.old .date {
      text-decoration: line-through;
      opacity: 0.7;
    }
    .time-box .time {
      font-size: 14px;
      color: #64748b;
      margin-top: 5px;
    }
    .time-box.old .time {
      text-decoration: line-through;
      opacity: 0.7;
    }
    .reason-box {
      background-color: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .reason-box .label {
      font-weight: 600;
      color: #92400e;
      font-size: 14px;
      margin-bottom: 5px;
    }
    .reason-box .text {
      color: #78350f;
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
      width: 120px;
      flex-shrink: 0;
    }
    .detail-value {
      color: #1e293b;
      flex: 1;
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
    @media (max-width: 480px) {
      .time-comparison {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Appointment Rescheduled</h1>
      <p>Your appointment time has been changed</p>
    </div>

    <div class="content">
      <div class="greeting">Hi ${data.client.first_name},</div>

      <p>
        We wanted to let you know that your grooming appointment has been rescheduled.
        Please review the new date and time below.
      </p>

      <div class="time-comparison">
        <div class="time-box old">
          <h3>Previous</h3>
          <div class="date">${oldDate}</div>
          <div class="time">${data.booking.old_time_start} - ${data.booking.old_time_end}</div>
        </div>
        <div class="time-box new">
          <h3>New Time</h3>
          <div class="date">${newDate}</div>
          <div class="time">${data.booking.new_time_start} - ${data.booking.new_time_end}</div>
        </div>
      </div>

      <div class="reason-box">
        <div class="label">Reason for Change:</div>
        <div class="text">${data.reason}</div>
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
      </div>

      <p style="color: #475569; margin-top: 25px;">
        If you have any questions or concerns about this change, please don't hesitate to contact us.
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

function generateGroomerTimeChangeHTML(data: TimeChangeEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const oldDate = formatDate(data.booking.old_date);
  const newDate = formatDate(data.booking.new_date);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; }
    .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px; }
    .content { padding: 20px 0; }
    .time-change { margin: 20px 0; padding: 15px; background: #fffbeb; border-radius: 8px; border-left: 4px solid #f59e0b; }
    .old-time { text-decoration: line-through; color: #dc2626; opacity: 0.7; }
    .new-time { color: #059669; font-weight: bold; }
    .detail { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .label { font-weight: bold; color: #f59e0b; }
    .reason { margin: 15px 0; padding: 10px; background: #fef3c7; border-radius: 4px; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Time Changed</h1>
    </div>
    <div class="content">
      <p>Hi ${data.groomer.first_name},</p>
      <p>A booking assigned to you has been rescheduled:</p>

      <div class="time-change">
        <p><strong>Previous:</strong> <span class="old-time">${oldDate} at ${data.booking.old_time_start} - ${data.booking.old_time_end}</span></p>
        <p><strong>New Time:</strong> <span class="new-time">${newDate} at ${data.booking.new_time_start} - ${data.booking.new_time_end}</span></p>
      </div>

      <div class="reason">
        <strong>Reason:</strong> ${data.reason}
      </div>

      <div class="detail">
        <div><span class="label">Client:</span> ${data.client.first_name} ${data.client.last_name}</div>
        <div><span class="label">Pet(s):</span> ${petNames.join(', ')}</div>
        <div><span class="label">Location:</span> ${data.booking.address}, ${data.booking.city}, ${data.booking.state}</div>
        <div><span class="label">Service:</span> ${data.booking.service_name || 'Grooming Service'}</div>
      </div>

      <p>Please update your schedule accordingly.</p>
    </div>
  </div>
</body>
</html>
`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS - must be set before any response
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('Time change email endpoint called', {
      method: req.method,
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : []
    });

    // Check if Resend is configured
    if (!resend) {
      console.error('RESEND_API_KEY is not configured');
      return res.status(500).json({
        success: false,
        error: 'Email service is not configured. RESEND_API_KEY is missing.'
      });
    }

    const emailData: TimeChangeEmailData = req.body;

    console.log('Received time change email request:', {
      bookingId: emailData?.booking?.id,
      hasClient: !!emailData?.client,
      hasGroomer: !!emailData?.groomer,
      hasPets: !!emailData?.pets,
      hasReason: !!emailData?.reason
    });

    if (!emailData.booking || !emailData.client || !emailData.groomer || !emailData.pets || !emailData.reason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required email data',
        received: {
          hasBooking: !!emailData?.booking,
          hasClient: !!emailData?.client,
          hasGroomer: !!emailData?.groomer,
          hasPets: !!emailData?.pets,
          hasReason: !!emailData?.reason
        }
      });
    }

    console.log('Sending emails to:', {
      clientEmail: emailData.client.email,
      groomerEmail: emailData.groomer.email,
      fromEmail: FROM_EMAIL
    });

    const results = await Promise.allSettled([
      // Send to client
      resend.emails.send({
        from: FROM_EMAIL,
        to: [emailData.client.email],
        subject: 'Your Royal Pawz Appointment Has Been Rescheduled',
        html: generateClientTimeChangeHTML(emailData),
      }),

      // Send to groomer
      resend.emails.send({
        from: FROM_EMAIL,
        to: [emailData.groomer.email],
        subject: 'Booking Time Changed - Royal Pawz',
        html: generateGroomerTimeChangeHTML(emailData),
      }),
    ]);

    // Check results
    const failures = results.filter(r => r.status === 'rejected');

    if (failures.length > 0) {
      console.error('Some time change emails failed to send:', failures);
      return res.status(207).json({
        success: true,
        message: 'Some emails sent successfully, but some failed',
        results: results
      });
    }

    console.log('All time change emails sent successfully');
    return res.json({
      success: true,
      message: 'All emails sent successfully',
      results: results
    });

  } catch (error) {
    console.error('Error sending time change emails:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
