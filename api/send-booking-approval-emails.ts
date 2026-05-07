import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env['RESEND_API_KEY']);
const FROM_EMAIL = process.env['FROM_EMAIL'] || 'confirmations@royalpawzusa.com';

interface PetLineItem {
  pet_name: string;
  package_name: string;        // 'Royal Bath' / 'Royal Groom' / 'Royal Spa'
  service_size: string;        // 'small' | 'medium' | 'large' | 'xl'
  service_charge: number;      // back-derived so Service + Coat + Addons = pet_total exactly
  breed_premium_amount: number;
  coat_category?: string;      // e.g. 'DOUBLE_COAT' (only displayed if surcharge > 0 and consistent)
  addons: Array<{ name: string; price: number }>;
  pet_total: number;           // matches what the booking actually charges for this pet
}

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
    // Pricing breakdown (optional — if absent, fall back to total-only display).
    original_subtotal?: number;
    discount_amount?: number;
    credits_applied?: number;
    subtotal_before_tax?: number;
    tax_amount?: number;
    tax_rate?: number;
    tip_amount?: number;
    payment_method_type?: string;
    payment_method_last4?: string;
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
  pet_breakdown?: PetLineItem[];
  adminEmail?: string;
}

const COAT_CATEGORY_LABELS: Record<string, string> = {
  STANDARD: 'Standard coat',
  DOUBLE_COAT: 'Double coat',
  CURLY: 'Curly coat',
  WIRE: 'Wire coat',
  LONG: 'Long coat',
  HEAVY: 'Heavy coat',
};

const SIZE_LABELS: Record<string, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  xl: 'Extra Large',
};

function fmt(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toFixed(2);
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

/**
 * Render a per-pet line-item breakdown that always sums exactly to pet.pet_total.
 *
 * The service charge is back-derived from pet_total - addons (- breed_premium if
 * we can verify it's in the total). This guarantees the visible math adds up,
 * even when underlying data has stale package_price or partially-applied
 * breed surcharges (see James Foster booking 222cda48 — package_price=125 vs
 * base_price=140, breed_premium stored but missing from pet_total).
 */
function renderPetBreakdownRows(pet: PetLineItem): string {
  const sizeLabel = SIZE_LABELS[pet.service_size?.toLowerCase()] || pet.service_size || '';
  const coatLabel = pet.coat_category ? COAT_CATEGORY_LABELS[pet.coat_category] || pet.coat_category : '';
  const lines: string[] = [];

  lines.push(`
    <tr>
      <td style="padding:6px 0;color:#1e293b;font-size:14px;">${escapeHtml(pet.package_name)} (${escapeHtml(sizeLabel)})</td>
      <td style="padding:6px 0;text-align:right;color:#1e293b;font-size:14px;">$${fmt(pet.service_charge)}</td>
    </tr>
  `);

  if (pet.breed_premium_amount > 0) {
    lines.push(`
      <tr>
        <td style="padding:6px 0;color:#475569;font-size:13px;padding-left:12px;">+ Coat surcharge${coatLabel ? ` <span style="color:#94a3b8">(${escapeHtml(coatLabel)})</span>` : ''}</td>
        <td style="padding:6px 0;text-align:right;color:#475569;font-size:13px;">$${fmt(pet.breed_premium_amount)}</td>
      </tr>
    `);
  }

  for (const addon of pet.addons || []) {
    lines.push(`
      <tr>
        <td style="padding:6px 0;color:#475569;font-size:13px;padding-left:12px;">+ ${escapeHtml(addon.name)}</td>
        <td style="padding:6px 0;text-align:right;color:#475569;font-size:13px;">$${fmt(addon.price)}</td>
      </tr>
    `);
  }

  return lines.join('');
}

function generatePricingBreakdownHTML(data: BookingEmailData, opts: { showCreditsEarnedNote?: boolean } = {}): string {
  const b = data.booking;
  const breakdown = data.pet_breakdown || [];

  // Fallback: no pet-level data → render the legacy total-only block.
  if (breakdown.length === 0) {
    return `
      <div style="background-color:#f8fafc;border-left:4px solid #667eea;padding:16px 20px;margin:20px 0;border-radius:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#1e293b;font-size:16px;">Total Amount</strong>
          <strong style="color:#1e293b;font-size:18px;">$${fmt(b.total_amount)}</strong>
        </div>
      </div>
    `;
  }

  const subtotal = Number(b.original_subtotal ?? breakdown.reduce((s, p) => s + p.pet_total, 0));
  const discount = Number(b.discount_amount || 0);
  const credits = Number(b.credits_applied || 0);
  const subtotalBeforeTax = Number(b.subtotal_before_tax ?? Math.max(0, subtotal - discount - credits));
  const tax = Number(b.tax_amount || 0);
  const taxRate = Number(b.tax_rate || 0.0825);
  const tip = Number(b.tip_amount || 0);
  const total = Number(b.total_amount || 0);

  const petBlocks = breakdown.map((pet) => `
    <div style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
      <div style="font-weight:600;color:#1e293b;font-size:14px;margin-bottom:6px;">${escapeHtml(pet.pet_name)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        ${renderPetBreakdownRows(pet)}
        <tr>
          <td style="padding:8px 0 0 0;color:#1e293b;font-size:13px;font-weight:600;">Subtotal for ${escapeHtml(pet.pet_name)}</td>
          <td style="padding:8px 0 0 0;text-align:right;color:#1e293b;font-size:13px;font-weight:600;">$${fmt(pet.pet_total)}</td>
        </tr>
      </table>
    </div>
  `).join('');

  const discountRow = discount > 0 ? `
    <tr>
      <td style="padding:6px 0;color:#16a34a;font-size:14px;">Promo discount</td>
      <td style="padding:6px 0;text-align:right;color:#16a34a;font-size:14px;">-$${fmt(discount)}</td>
    </tr>
  ` : '';

  const creditsRow = credits > 0 ? `
    <tr>
      <td style="padding:6px 0;color:#16a34a;font-size:14px;">Royal Rewards credits applied</td>
      <td style="padding:6px 0;text-align:right;color:#16a34a;font-size:14px;">-$${fmt(credits)}</td>
    </tr>
  ` : '';

  const netSubtotalRow = (discount > 0 || credits > 0) ? `
    <tr>
      <td style="padding:6px 0;color:#475569;font-size:14px;border-top:1px solid #e2e8f0;">Subtotal after savings</td>
      <td style="padding:6px 0;text-align:right;color:#475569;font-size:14px;border-top:1px solid #e2e8f0;">$${fmt(subtotalBeforeTax)}</td>
    </tr>
  ` : '';

  // total_amount stored on the booking is the SERVICE TOTAL (pre-tip).
  // amount_paid (set after capture) = total_amount + tip_amount. When tip > 0,
  // we surface both so the breakdown adds up: ... Tax → Service Total → Tip
  // → Total Paid. Without this the email showed Tip but used total_amount as
  // the final line, which didn't match the tip+service math the customer
  // expected.
  const totalSection = tip > 0 ? `
        <tr>
          <td style="padding:8px 0 0 0;color:#1e293b;font-size:14px;font-weight:600;border-top:1px solid #e2e8f0;">Service Total</td>
          <td style="padding:8px 0 0 0;text-align:right;color:#1e293b;font-size:14px;font-weight:600;border-top:1px solid #e2e8f0;">$${fmt(total)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#475569;font-size:14px;">Tip</td>
          <td style="padding:6px 0;text-align:right;color:#475569;font-size:14px;">$${fmt(tip)}</td>
        </tr>
        <tr>
          <td style="padding:12px 0 0 0;color:#1e293b;font-size:18px;font-weight:700;border-top:2px solid #1e293b;">Total Paid</td>
          <td style="padding:12px 0 0 0;text-align:right;color:#1e293b;font-size:18px;font-weight:700;border-top:2px solid #1e293b;">$${fmt(total + tip)}</td>
        </tr>
  ` : `
        <tr>
          <td style="padding:12px 0 0 0;color:#1e293b;font-size:18px;font-weight:700;border-top:2px solid #1e293b;">Total</td>
          <td style="padding:12px 0 0 0;text-align:right;color:#1e293b;font-size:18px;font-weight:700;border-top:2px solid #1e293b;">$${fmt(total)}</td>
        </tr>
  `;

  const paymentMethodLine = (b.payment_method_last4 || b.payment_method_type) ? `
    <p style="color:#64748b;font-size:13px;margin:8px 0 0 0;">
      Payment: ${escapeHtml(b.payment_method_type || 'card')}${b.payment_method_last4 ? ` ending in ${escapeHtml(b.payment_method_last4)}` : ''}
    </p>
  ` : '';

  const creditsEarnedNote = opts.showCreditsEarnedNote
    ? `<p style="color:#0f766e;font-size:13px;margin:10px 0 0 0;">You'll earn 10% Royal Rewards credits on this booking after service.</p>`
    : '';

  return `
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;padding:20px;margin:20px 0;border-radius:8px;">
      <h3 style="margin:0 0 12px 0;color:#1e293b;font-size:16px;font-weight:700;">Pricing details</h3>

      ${petBlocks}

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:14px;">
        <tr>
          <td style="padding:8px 0;color:#1e293b;font-size:14px;font-weight:600;">Subtotal</td>
          <td style="padding:8px 0;text-align:right;color:#1e293b;font-size:14px;font-weight:600;">$${fmt(subtotal)}</td>
        </tr>
        ${discountRow}
        ${creditsRow}
        ${netSubtotalRow}
        <tr>
          <td style="padding:6px 0;color:#475569;font-size:14px;">Tax (${(taxRate * 100).toFixed(2)}%)</td>
          <td style="padding:6px 0;text-align:right;color:#475569;font-size:14px;">$${fmt(tax)}</td>
        </tr>
        ${totalSection}
      </table>

      ${paymentMethodLine}
      ${creditsEarnedNote}
    </div>
  `;
}

function generateClientEmailHTML(data: BookingEmailData): string {
  const petNames = data.pets.map(p => p.name);
  const date = new Date(data.booking.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const breakdownHTML = generatePricingBreakdownHTML(data, { showCreditsEarnedNote: true });

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
      <div class="greeting">Hi ${escapeHtml(data.client.first_name)},</div>

      <div>
        Great news! Your grooming appointment has been confirmed. We're excited to pamper your furry friend${petNames.length > 1 ? 's' : ''}!
      </div>

      <div class="highlight">
        <strong>${escapeHtml(date)} at ${escapeHtml(data.booking.scheduled_time_start)} - ${escapeHtml(data.booking.scheduled_time_end)}</strong>
      </div>

      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${escapeHtml(data.booking.service_name || 'Grooming Service')}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Pet${petNames.length > 1 ? 's' : ''}:</span>
          <span class="detail-value">
            ${petNames.map((name) => `<span class="pet-item">${escapeHtml(name)}</span>`).join('')}
          </span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Groomer:</span>
          <span class="detail-value">${escapeHtml(data.groomer.first_name)} ${escapeHtml(data.groomer.last_name)}</span>
        </div>

        <div class="detail-row">
          <span class="detail-label">Location:</span>
          <span class="detail-value">${escapeHtml(data.booking.address)}, ${escapeHtml(data.booking.city)}, ${escapeHtml(data.booking.state)}</span>
        </div>
      </div>

      ${breakdownHTML}

      <p style="color: #475569; margin-top: 25px;">
        <strong>What to expect:</strong><br>
        - Your groomer will arrive at the scheduled time<br>
        - The grooming service will be done in our mobile van<br>
        - We'll send you before and after photos<br>
        - Payment will be processed after service completion<br>
        - Need to reschedule? Text us at (832) 504-0760 or email support@royalpawzusa.com
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
      <p>Hi ${escapeHtml(data.groomer.first_name)},</p>
      <p>You have been assigned a new grooming appointment:</p>

      <div class="detail">
        <div><span class="label">Date & Time:</span> ${escapeHtml(date)} at ${escapeHtml(data.booking.scheduled_time_start)} - ${escapeHtml(data.booking.scheduled_time_end)}</div>
        <div><span class="label">Client:</span> ${escapeHtml(data.client.first_name)} ${escapeHtml(data.client.last_name)}</div>
        <div><span class="label">Pet(s):</span> ${petNames.map(escapeHtml).join(', ')}</div>
        <div><span class="label">Location:</span> ${escapeHtml(data.booking.address)}, ${escapeHtml(data.booking.city)}, ${escapeHtml(data.booking.state)}</div>
        <div><span class="label">Service:</span> ${escapeHtml(data.booking.service_name || 'Grooming Service')}</div>
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

  const breakdownHTML = generatePricingBreakdownHTML(data);

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
        <div><span class="label">Booking ID:</span> ${escapeHtml(data.booking.id)}</div>
        <div><span class="label">Date & Time:</span> ${escapeHtml(date)} at ${escapeHtml(data.booking.scheduled_time_start)} - ${escapeHtml(data.booking.scheduled_time_end)}</div>
        <div><span class="label">Client:</span> ${escapeHtml(data.client.first_name)} ${escapeHtml(data.client.last_name)} (${escapeHtml(data.client.email)})</div>
        <div><span class="label">Groomer:</span> ${escapeHtml(data.groomer.first_name)} ${escapeHtml(data.groomer.last_name)} (${escapeHtml(data.groomer.email)})</div>
        <div><span class="label">Pet(s):</span> ${petNames.map(escapeHtml).join(', ')}</div>
        <div><span class="label">Location:</span> ${escapeHtml(data.booking.address)}, ${escapeHtml(data.booking.city)}, ${escapeHtml(data.booking.state)}</div>
      </div>

      ${breakdownHTML}

      <p>All parties have been notified via email.</p>
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
    const emailData: BookingEmailData = req.body;

    if (!emailData.booking || !emailData.client || !emailData.groomer || !emailData.pets) {
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
        subject: 'Your Royal Pawz Appointment is Confirmed!',
        html: generateClientEmailHTML(emailData),
      });
      results.push({ status: 'fulfilled', value: clientResult, recipient: 'client' });
      console.log('Client email sent successfully to:', emailData.client.email);
    } catch (error) {
      results.push({ status: 'rejected', reason: error, recipient: 'client' });
      console.error('Failed to send client email:', error);
    }

    await delay(1000); // Wait 1 second to avoid rate limit

    // 2. Send to groomer
    try {
      const groomerResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: [emailData.groomer.email],
        subject: 'New Booking Assignment - Royal Pawz',
        html: generateGroomerEmailHTML(emailData),
      });
      results.push({ status: 'fulfilled', value: groomerResult, recipient: 'groomer' });
      console.log('Groomer email sent successfully to:', emailData.groomer.email);
    } catch (error) {
      results.push({ status: 'rejected', reason: error, recipient: 'groomer' });
      console.error('Failed to send groomer email:', error);
    }

    await delay(1000);

    // 3. Send to admin (if provided)
    if (emailData.adminEmail) {
      try {
        const adminResult = await resend.emails.send({
          from: FROM_EMAIL,
          to: [emailData.adminEmail],
          subject: 'Booking Approved - Royal Pawz Admin',
          html: generateAdminEmailHTML(emailData),
        });
        results.push({ status: 'fulfilled', value: adminResult, recipient: 'admin' });
        console.log('Admin email sent successfully to:', emailData.adminEmail);
      } catch (error) {
        results.push({ status: 'rejected', reason: error, recipient: 'admin' });
        console.error('Failed to send admin email:', error);
      }
    }

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
