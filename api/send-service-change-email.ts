import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env['RESEND_API_KEY'];
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_EMAIL = process.env['FROM_EMAIL'] || 'confirmations@royalpawzusa.com';

/**
 * Customer notification when an admin or groomer adjusts the service/price on
 * an existing booking. This endpoint was previously missing — the admin flow
 * was firing off requests to it and silently swallowing 404s, which meant
 * customers were never told the price changed (the James Foster cancellation
 * pattern). This is the missing piece that closes the trust loop:
 * every price change → explicit customer notification with old/new breakdown.
 */
interface ServiceChangeEmailData {
  booking: {
    id: string;
    scheduled_date: string;
    address: string;
    city: string;
    state: string;
  };
  client: {
    first_name: string;
    last_name: string;
    email: string;
  };
  pet: {
    name: string;
  };
  oldService: {
    package_name: string;
    total_price: number;
    addons: string[];
  };
  newService: {
    package_name: string;
    total_price: number;
    addons: string[];
  };
  priceDifference: number;
  reason: string;
  newBookingTotal?: number;
}

function escapeHtml(s: string | undefined | null): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(n: number | null | undefined): string {
  return (Number(n) || 0).toFixed(2);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderAddonList(addons: string[]): string {
  if (!addons || addons.length === 0) return '<em style="color:#94a3b8">No add-ons</em>';
  return addons.map(escapeHtml).map(name => `<div>• ${name}</div>`).join('');
}

function generateClientHTML(data: ServiceChangeEmailData): string {
  const date = formatDate(data.booking.scheduled_date);
  const diff = Number(data.priceDifference) || 0;
  const isIncrease = diff > 0;
  const isDecrease = diff < 0;
  const diffLabel = isIncrease
    ? `+$${fmt(Math.abs(diff))} more`
    : isDecrease
    ? `-$${fmt(Math.abs(diff))} less`
    : 'No change';
  const diffColor = isIncrease ? '#dc2626' : isDecrease ? '#16a34a' : '#475569';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Updated</title>
</head>
<body style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;background-color:#f5f5f5;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">

    <div style="background:linear-gradient(135deg,#3b82f6 0%,#1e3a8a 100%);color:white;padding:30px 20px;text-align:center;">
      <h1 style="margin:0;font-size:26px;font-weight:700;">Your booking was updated</h1>
      <p style="margin:8px 0 0 0;font-size:14px;opacity:0.9;">Here's what changed and why</p>
    </div>

    <div style="padding:30px 20px;">
      <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 12px 0;">Hi ${escapeHtml(data.client.first_name)},</p>

      <p style="margin:0 0 16px 0;color:#475569;">
        We made a change to <strong>${escapeHtml(data.pet.name)}</strong>'s grooming on <strong>${escapeHtml(date)}</strong>.
      </p>

      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
        <strong style="color:#1e293b;">Reason for change:</strong>
        <div style="color:#475569;margin-top:4px;">${escapeHtml(data.reason)}</div>
      </div>

      <h3 style="margin:24px 0 8px 0;color:#1e293b;font-size:16px;">What was on your booking</h3>
      <div style="background-color:#fef2f2;border-left:4px solid #fca5a5;padding:12px 16px;border-radius:4px;margin:0 0 16px 0;">
        <div style="font-weight:600;color:#1e293b;">${escapeHtml(data.oldService.package_name)}</div>
        <div style="margin-top:8px;color:#475569;font-size:14px;">${renderAddonList(data.oldService.addons)}</div>
        <div style="margin-top:10px;font-size:14px;">
          <strong style="color:#1e293b;">Was:</strong>
          <span style="color:#1e293b;">$${fmt(data.oldService.total_price)}</span>
        </div>
      </div>

      <h3 style="margin:0 0 8px 0;color:#1e293b;font-size:16px;">What's on your booking now</h3>
      <div style="background-color:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;border-radius:4px;margin:0 0 16px 0;">
        <div style="font-weight:600;color:#1e293b;">${escapeHtml(data.newService.package_name)}</div>
        <div style="margin-top:8px;color:#475569;font-size:14px;">${renderAddonList(data.newService.addons)}</div>
        <div style="margin-top:10px;font-size:14px;">
          <strong style="color:#1e293b;">Now:</strong>
          <span style="color:#1e293b;">$${fmt(data.newService.total_price)}</span>
          <span style="color:${diffColor};font-weight:600;margin-left:8px;">(${diffLabel})</span>
        </div>
      </div>

      ${data.newBookingTotal !== undefined ? `
      <div style="background-color:#dbeafe;border:2px solid #3b82f6;padding:14px 16px;border-radius:6px;margin:18px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#1e40af;font-size:15px;">New booking total</strong>
          <strong style="color:#1e40af;font-size:18px;">$${fmt(data.newBookingTotal)}</strong>
        </div>
        <p style="margin:6px 0 0 0;color:#1e3a8a;font-size:13px;">
          Includes tax, any promo discounts, and Royal Rewards credits applied.
        </p>
      </div>
      ` : ''}

      <p style="color:#475569;margin-top:24px;font-size:14px;">
        <strong>Have a question?</strong> Text us at (832) 504-0760 or email
        <a href="mailto:support@royalpawzusa.com" style="color:#3b82f6;">support@royalpawzusa.com</a> —
        if anything looks off, we want to know before your appointment.
      </p>

      <p style="color:#475569;margin-top:8px;font-size:14px;">
        Need to cancel? You can do that from the app any time before your appointment.
      </p>
    </div>

    <div style="background-color:#f8fafc;padding:20px;text-align:center;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;"><strong>Royal Pawz Mobile Grooming</strong></p>
      <p style="margin:4px 0 0 0;">Bringing luxury grooming to your doorstep</p>
    </div>
  </div>
</body>
</html>
  `;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const data: ServiceChangeEmailData = req.body;

    if (!data.booking || !data.client?.email || !data.pet || !data.oldService || !data.newService) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!resend) {
      console.warn('RESEND_API_KEY not configured — skipping service change email');
      return res.status(200).json({ success: true, skipped: true, reason: 'no api key' });
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [data.client.email],
      subject: `Your Royal Pawz booking was updated — ${data.pet.name}`,
      html: generateClientHTML(data),
    });

    console.log('Service change email sent to:', data.client.email, 'result:', result);
    return res.json({ success: true, message: 'Service change email sent', result });
  } catch (error) {
    console.error('Error sending service change email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send service change email',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
