import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env['RESEND_API_KEY'];
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_EMAIL = process.env['FROM_EMAIL'] || 'confirmations@royalpawzusa.com';

/**
 * Customer notification when an admin applies (or revises) a discount on a
 * booking. Without this, the bookings row updates correctly but the original
 * confirmation email goes silently stale — customer sees old price in their
 * inbox vs. new price on the manage page. This closes the loop: every admin
 * discount → revised receipt with old/new totals.
 */
interface DiscountAppliedEmailData {
  booking: {
    id: string;
    scheduled_date: string;
    scheduled_time_start?: string;
    scheduled_time_end?: string;
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
  petNames?: string[];
  previousTotal: number;
  newTotal: number;
  discountAmount: number;
  reason?: string;
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
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime12h(time: string | undefined): string {
  if (!time) return '';
  const parts = time.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] ?? 0;
  const period = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 || 12;
  return `${display}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function generateClientHTML(data: DiscountAppliedEmailData): string {
  const date = formatDate(data.booking.scheduled_date);
  const timeRange = data.booking.scheduled_time_start
    ? `${formatTime12h(data.booking.scheduled_time_start)}${
        data.booking.scheduled_time_end ? ` – ${formatTime12h(data.booking.scheduled_time_end)}` : ''
      }`
    : '';
  const previous = Number(data.previousTotal) || 0;
  const next = Number(data.newTotal) || 0;
  const discount = Number(data.discountAmount) || 0;
  const savings = Math.max(0, Math.round((previous - next) * 100) / 100);
  const petLabel = data.petNames && data.petNames.length > 0 ? data.petNames.join(', ') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Updated booking confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,30,61,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0a1528 0%,#162a4a 100%);padding:40px 30px;text-align:center;">
              <p style="margin:0 0 12px;font-size:12px;letter-spacing:3px;color:#D4AF37;text-transform:uppercase;font-weight:600;">Royal Pawz</p>
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.3;">Updated booking confirmation</h1>
              <p style="margin:12px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Confirmation #${escapeHtml(data.booking.id.slice(-8).toUpperCase())}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 30px;">
              <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Hi ${escapeHtml(data.client.first_name)},</p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">
                Good news — we&rsquo;ve applied a price adjustment to your upcoming appointment. Here are the updated details for your records.
              </p>

              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:0 0 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;font-size:14px;">Date</td>
                    <td style="padding:6px 0;color:#0a1528;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(date)}</td>
                  </tr>
                  ${timeRange ? `
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;font-size:14px;">Time</td>
                    <td style="padding:6px 0;color:#0a1528;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(timeRange)}</td>
                  </tr>` : ''}
                  ${data.booking.service_name ? `
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;font-size:14px;">Service</td>
                    <td style="padding:6px 0;color:#0a1528;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(data.booking.service_name)}</td>
                  </tr>` : ''}
                  ${petLabel ? `
                  <tr>
                    <td style="padding:6px 0;color:#6b7280;font-size:14px;">Pet${data.petNames!.length > 1 ? 's' : ''}</td>
                    <td style="padding:6px 0;color:#0a1528;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(petLabel)}</td>
                  </tr>` : ''}
                </table>
              </div>

              <h3 style="margin:24px 0 10px;color:#1e293b;font-size:16px;">Updated total</h3>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:18px 20px;">
                <tr>
                  <td style="padding:4px 0;color:#065f46;font-size:14px;">Previous total</td>
                  <td style="padding:4px 0;color:#065f46;font-size:14px;text-align:right;text-decoration:line-through;">$${fmt(previous)}</td>
                </tr>
                ${discount > 0 ? `
                <tr>
                  <td style="padding:4px 0;color:#065f46;font-size:14px;">Discount applied</td>
                  <td style="padding:4px 0;color:#065f46;font-size:14px;text-align:right;font-weight:600;">-$${fmt(discount)}</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:10px 0 4px;color:#0a1528;font-size:16px;font-weight:700;border-top:1px solid #a7f3d0;">New total</td>
                  <td style="padding:10px 0 4px;color:#0a1528;font-size:18px;font-weight:700;text-align:right;border-top:1px solid #a7f3d0;">$${fmt(next)}</td>
                </tr>
                ${savings > 0 ? `
                <tr>
                  <td colspan="2" style="padding:8px 0 0;color:#047857;font-size:13px;text-align:center;">
                    You saved $${fmt(savings)} on this booking 🎉
                  </td>
                </tr>` : ''}
              </table>

              ${data.reason ? `
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin:20px 0 0;">
                <strong style="color:#1e293b;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Note from our team</strong>
                <div style="color:#475569;margin-top:6px;font-size:14px;line-height:1.6;">${escapeHtml(data.reason)}</div>
              </div>` : ''}

              <p style="color:#475569;margin:24px 0 0;font-size:14px;line-height:1.6;">
                Questions about this change? Text us at (832) 504-0760 or email
                <a href="mailto:support@royalpawzusa.com" style="color:#0a1528;font-weight:600;">support@royalpawzusa.com</a> — we&rsquo;re happy to walk through it.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 30px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:12px;line-height:1.6;">
              Royal Pawz Mobile Grooming | Houston, TX<br>
              This message replaces any previous confirmation for this booking.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    const data: DiscountAppliedEmailData = req.body;

    if (!data?.booking?.id || !data?.client?.email) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!resend) {
      console.warn('RESEND_API_KEY not configured — skipping discount email');
      return res.status(200).json({ success: true, skipped: true, reason: 'no api key' });
    }

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [data.client.email],
      subject: `Updated booking confirmation — #${data.booking.id.slice(-8).toUpperCase()}`,
      html: generateClientHTML(data),
    });

    console.log('Discount applied email sent to:', data.client.email, 'result:', result);
    return res.json({ success: true, message: 'Discount email sent', result });
  } catch (error) {
    console.error('Error sending discount applied email:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send discount applied email',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
