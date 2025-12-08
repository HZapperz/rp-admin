import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

// Initialize Resend only if API key exists
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'confirmations@royalpawzusa.com';

interface ChangeRequestEmailData {
  type: 'approved' | 'rejected';
  booking: {
    id: string;
    original_date: string;
    original_time_start: string;
    original_time_end: string;
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
  admin_response?: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function generateApprovedClientHTML(data: ChangeRequestEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const newDate = formatDate(data.booking.new_date);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Change Request Approved</title>
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
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
    .success-box {
      background-color: #ecfdf5;
      border: 2px solid #6ee7b7;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
      margin: 20px 0;
    }
    .success-box h2 {
      color: #059669;
      margin: 0 0 10px 0;
    }
    .details-box {
      background-color: #f8fafc;
      border-left: 4px solid #10b981;
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Change Request Approved!</h1>
      <p>Your appointment has been rescheduled</p>
    </div>

    <div class="content">
      <div class="greeting">Hi ${data.client.first_name},</div>

      <p>
        Great news! Your request to change your grooming appointment has been approved.
        Your appointment has been rescheduled to the new date and time.
      </p>

      <div class="success-box">
        <h2>New Appointment Time</h2>
        <p style="font-size: 18px; margin: 0;">
          <strong>${newDate}</strong><br>
          ${data.booking.new_time_start} - ${data.booking.new_time_end}
        </p>
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
        If you have any questions, please don't hesitate to contact us.
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

function generateRejectedClientHTML(data: ChangeRequestEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const originalDate = formatDate(data.booking.original_date);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Change Request Update</title>
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
    .info-box {
      background-color: #fef3c7;
      border: 2px solid #fcd34d;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .info-box p {
      margin: 0;
      color: #92400e;
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Change Request Update</h1>
      <p>Regarding your reschedule request</p>
    </div>

    <div class="content">
      <div class="greeting">Hi ${data.client.first_name},</div>

      <p>
        We've reviewed your request to change your grooming appointment, but unfortunately
        we're unable to accommodate the requested change at this time.
      </p>

      ${data.admin_response ? `
      <div class="info-box">
        <p><strong>Note from our team:</strong></p>
        <p>${data.admin_response}</p>
      </div>
      ` : ''}

      <p>
        Your original appointment remains scheduled as follows:
      </p>

      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Date & Time:</span>
          <span class="detail-value">${originalDate} at ${data.booking.original_time_start} - ${data.booking.original_time_end}</span>
        </div>

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
          <span class="detail-label">Location:</span>
          <span class="detail-value">${data.booking.address}, ${data.booking.city}, ${data.booking.state}</span>
        </div>
      </div>

      <p style="color: #475569; margin-top: 25px;">
        If you have any questions or need to discuss alternative options, please don't hesitate
        to contact us. We're here to help!
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

function generateGroomerNotificationHTML(data: ChangeRequestEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const newDate = formatDate(data.booking.new_date);

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
      <h1>Booking Time Updated</h1>
    </div>
    <div class="content">
      <p>Hi ${data.groomer.first_name},</p>
      <p>A booking assigned to you has been rescheduled:</p>

      <div class="detail">
        <div><span class="label">New Date & Time:</span> ${newDate} at ${data.booking.new_time_start} - ${data.booking.new_time_end}</div>
        <div><span class="label">Client:</span> ${data.client.first_name} ${data.client.last_name}</div>
        <div><span class="label">Pet(s):</span> ${petNames.join(', ')}</div>
        <div><span class="label">Location:</span> ${data.booking.address}, ${data.booking.city}, ${data.booking.state}</div>
      </div>

      <p>Please update your schedule accordingly.</p>
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
    // Check if Resend is configured
    if (!resend) {
      console.error('RESEND_API_KEY is not configured');
      return res.status(500).json({
        success: false,
        error: 'Email service is not configured. RESEND_API_KEY is missing.'
      });
    }

    const emailData: ChangeRequestEmailData = req.body;

    console.log('Received change request email request:', {
      type: emailData?.type,
      bookingId: emailData?.booking?.id,
      hasClient: !!emailData?.client,
      hasGroomer: !!emailData?.groomer,
    });

    if (!emailData.type || !emailData.booking || !emailData.client || !emailData.groomer || !emailData.pets) {
      return res.status(400).json({
        success: false,
        error: 'Missing required email data',
        received: {
          hasType: !!emailData?.type,
          hasBooking: !!emailData?.booking,
          hasClient: !!emailData?.client,
          hasGroomer: !!emailData?.groomer,
          hasPets: !!emailData?.pets,
        }
      });
    }

    const emailsToSend = [];

    if (emailData.type === 'approved') {
      // Send approval email to client
      emailsToSend.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [emailData.client.email],
          subject: 'Your Royal Pawz Appointment Change Has Been Approved!',
          html: generateApprovedClientHTML(emailData),
        })
      );

      // Send notification to groomer about the time change
      emailsToSend.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [emailData.groomer.email],
          subject: 'Booking Time Updated - Royal Pawz',
          html: generateGroomerNotificationHTML(emailData),
        })
      );
    } else if (emailData.type === 'rejected') {
      // Send rejection email to client
      emailsToSend.push(
        resend.emails.send({
          from: FROM_EMAIL,
          to: [emailData.client.email],
          subject: 'Update on Your Royal Pawz Change Request',
          html: generateRejectedClientHTML(emailData),
        })
      );
    }

    console.log('Sending emails to:', {
      clientEmail: emailData.client.email,
      groomerEmail: emailData.type === 'approved' ? emailData.groomer.email : 'N/A',
      fromEmail: FROM_EMAIL
    });

    const results = await Promise.allSettled(emailsToSend);

    // Check results
    const failures = results.filter(r => r.status === 'rejected');

    if (failures.length > 0) {
      console.error('Some change request emails failed to send:', failures);
      return res.status(207).json({
        success: true,
        message: 'Some emails sent successfully, but some failed',
        results: results
      });
    }

    console.log('All change request emails sent successfully');
    return res.json({
      success: true,
      message: 'All emails sent successfully',
      results: results
    });

  } catch (error) {
    console.error('Error sending change request emails:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
