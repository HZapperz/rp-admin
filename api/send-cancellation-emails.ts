import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env['RESEND_API_KEY']);
const FROM_EMAIL = process.env['FROM_EMAIL'] || 'confirmations@royalpawzusa.com';

interface CancellationEmailData {
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
  groomer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pets: Array<{
    name: string;
  }>;
  reason?: string;
  cancelled_by?: string; // 'admin' | 'client' | 'system'
  refund_amount?: number;
  adminEmail?: string;
}

function generateClientCancellationEmailHTML(data: CancellationEmailData): string {
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
  <title>Booking Cancelled</title>
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
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
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
      border-left: 4px solid #ef4444;
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
      background-color: #fee2e2;
      border: 2px solid #ef4444;
      padding: 15px;
      border-radius: 6px;
      margin: 20px 0;
      text-align: center;
    }
    .highlight strong {
      color: #991b1b;
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
    .reason-box {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .refund-box {
      background-color: #d1fae5;
      border-left: 4px solid #10b981;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
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
      <h1>Booking Cancelled</h1>
      <p>Your appointment has been cancelled</p>
    </div>

    <div class="content">
      <div class="greeting">Hi ${data.client.first_name},</div>

      <div>
        Your grooming appointment has been cancelled. We're sorry we won't be able to see ${petNames.length > 1 ? 'your furry friends' : petNames[0]} this time.
      </div>

      <div class="highlight">
        <strong>Cancelled Appointment: ${date} at ${data.booking.scheduled_time_start} - ${data.booking.scheduled_time_end}</strong>
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

        ${data.groomer ? `
        <div class="detail-row">
          <span class="detail-label">Groomer:</span>
          <span class="detail-value">${data.groomer.first_name} ${data.groomer.last_name}</span>
        </div>
        ` : ''}

        <div class="detail-row">
          <span class="detail-label">Location:</span>
          <span class="detail-value">${data.booking.address}, ${data.booking.city}, ${data.booking.state}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Original Amount:</span>
          <span class="detail-value"><strong>$${data.booking.total_amount.toFixed(2)}</strong></span>
        </div>
      </div>

      ${data.reason ? `
      <div class="reason-box">
        <strong>Cancellation Reason:</strong><br>
        ${data.reason}
      </div>
      ` : ''}

      ${data.refund_amount !== undefined && data.refund_amount > 0 ? `
      <div class="refund-box">
        <strong>Refund Information:</strong><br>
        A refund of $${data.refund_amount.toFixed(2)} will be processed to your original payment method within 5-10 business days.
      </div>
      ` : data.refund_amount === 0 ? `
      <div class="reason-box">
        <strong>Refund Information:</strong><br>
        As per our cancellation policy, no refund is available for cancellations less than 24 hours before the scheduled appointment.
      </div>
      ` : ''}

      <p style="color: #475569; margin-top: 25px;">
        <strong>Want to reschedule?</strong><br>
        We'd love to see ${petNames.length > 1 ? 'your pets' : petNames[0]} soon! You can book a new appointment anytime at royalpawzusa.com or by calling/texting us at (832) 504-0760.
      </p>

      <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
        If you have any questions about this cancellation, please contact us at support@royalpawzusa.com or (832) 504-0760.
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

function generateGroomerCancellationEmailHTML(data: CancellationEmailData): string {
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
    .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px; }
    .content { padding: 20px 0; }
    .detail { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .label { font-weight: bold; color: #ef4444; }
    .reason { background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 15px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi ${data.groomer?.first_name || 'there'},</p>
      <p>The following appointment has been cancelled and removed from your schedule:</p>

      <div class="detail">
        <div><span class="label">Date & Time:</span> ${date} at ${data.booking.scheduled_time_start} - ${data.booking.scheduled_time_end}</div>
        <div><span class="label">Client:</span> ${data.client.first_name} ${data.client.last_name}</div>
        <div><span class="label">Pet(s):</span> ${petNames.join(', ')}</div>
        <div><span class="label">Location:</span> ${data.booking.address}, ${data.booking.city}, ${data.booking.state}</div>
        <div><span class="label">Service:</span> ${data.booking.service_name || 'Grooming Service'}</div>
      </div>

      ${data.reason ? `
      <div class="reason">
        <strong>Cancellation Reason:</strong><br>
        ${data.reason}
      </div>
      ` : ''}

      <p>This time slot is now available for other bookings. If you have any questions, please contact the admin team.</p>
    </div>
  </div>
</body>
</html>
`;
}

function generateAdminCancellationEmailHTML(data: CancellationEmailData): string {
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
    .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px; }
    .content { padding: 20px 0; }
    .detail { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .label { font-weight: bold; color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Booking Cancelled</h1>
    </div>
    <div class="content">
      <p>A booking has been cancelled:</p>

      <div class="detail">
        <div><span class="label">Booking ID:</span> ${data.booking.id}</div>
        <div><span class="label">Date & Time:</span> ${date} at ${data.booking.scheduled_time_start} - ${data.booking.scheduled_time_end}</div>
        <div><span class="label">Client:</span> ${data.client.first_name} ${data.client.last_name} (${data.client.email})</div>
        ${data.groomer ? `<div><span class="label">Groomer:</span> ${data.groomer.first_name} ${data.groomer.last_name} (${data.groomer.email})</div>` : ''}
        <div><span class="label">Pet(s):</span> ${petNames.join(', ')}</div>
        <div><span class="label">Location:</span> ${data.booking.address}, ${data.booking.city}, ${data.booking.state}</div>
        <div><span class="label">Total Amount:</span> $${data.booking.total_amount.toFixed(2)}</div>
        ${data.cancelled_by ? `<div><span class="label">Cancelled By:</span> ${data.cancelled_by}</div>` : ''}
        ${data.refund_amount !== undefined ? `<div><span class="label">Refund Amount:</span> $${data.refund_amount.toFixed(2)}</div>` : ''}
      </div>

      ${data.reason ? `
      <div style="background: #fef3c7; padding: 15px; border-left: 4px solid #f59e0b; margin: 15px 0; border-radius: 4px;">
        <strong>Cancellation Reason:</strong><br>
        ${data.reason}
      </div>
      ` : ''}

      <p>All relevant parties have been notified via email.</p>
    </div>
  </div>
</body>
</html>
`;
}

// Helper to delay between emails to avoid Resend rate limiting (2 req/sec)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    const emailData: CancellationEmailData = req.body;

    if (!emailData.booking || !emailData.client || !emailData.pets) {
      return res.status(400).json({
        success: false,
        error: 'Missing required email data'
      });
    }

    // Send emails sequentially with 1 second delay to avoid Resend rate limit (2 req/sec)
    const results: Array<{ status: string; value?: any; reason?: any; recipient: string }> = [];

    // 1. Send to client (most important - send first)
    try {
      const clientResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: [emailData.client.email],
        subject: 'Your Royal Pawz Appointment Has Been Cancelled',
        html: generateClientCancellationEmailHTML(emailData),
      });
      results.push({ status: 'fulfilled', value: clientResult, recipient: 'client' });
      console.log('Client cancellation email sent successfully to:', emailData.client.email);
    } catch (error) {
      results.push({ status: 'rejected', reason: error, recipient: 'client' });
      console.error('Failed to send client cancellation email:', error);
    }

    await delay(1000); // Wait 1 second to avoid rate limit

    // 2. Send to groomer (if assigned)
    if (emailData.groomer && emailData.groomer.email) {
      try {
        const groomerResult = await resend.emails.send({
          from: FROM_EMAIL,
          to: [emailData.groomer.email],
          subject: 'Booking Cancelled - Royal Pawz',
          html: generateGroomerCancellationEmailHTML(emailData),
        });
        results.push({ status: 'fulfilled', value: groomerResult, recipient: 'groomer' });
        console.log('Groomer cancellation email sent successfully to:', emailData.groomer.email);
      } catch (error) {
        results.push({ status: 'rejected', reason: error, recipient: 'groomer' });
        console.error('Failed to send groomer cancellation email:', error);
      }

      await delay(1000);
    }

    // 3. Send to admin (if provided)
    if (emailData.adminEmail) {
      try {
        const adminResult = await resend.emails.send({
          from: FROM_EMAIL,
          to: [emailData.adminEmail],
          subject: 'Booking Cancelled - Royal Pawz Admin',
          html: generateAdminCancellationEmailHTML(emailData),
        });
        results.push({ status: 'fulfilled', value: adminResult, recipient: 'admin' });
        console.log('Admin cancellation email sent successfully to:', emailData.adminEmail);
      } catch (error) {
        results.push({ status: 'rejected', reason: error, recipient: 'admin' });
        console.error('Failed to send admin cancellation email:', error);
      }
    }

    // Check results
    const failures = results.filter(r => r.status === 'rejected');

    if (failures.length > 0) {
      console.error('Some cancellation emails failed to send:', failures);
      return res.status(207).json({
        success: true,
        message: 'Some emails sent successfully, but some failed',
        results: results
      });
    }

    console.log('All cancellation emails sent successfully');
    return res.json({
      success: true,
      message: 'All cancellation emails sent successfully',
      results: results
    });

  } catch (error) {
    console.error('Error sending cancellation emails:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send cancellation emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
