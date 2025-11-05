# Royal Pawz Admin - Email & Booking Approval Setup

## Overview
This document explains the email sending and booking approval system in the Royal Pawz admin dashboard.

## Changes Made

### 1. Email Configuration
- **Fixed .env variable**: Changed `NEXT_PUBLIC_RESEND` to `RESEND_API_KEY`
- **Email Service**: Created a standalone Express server (`server.ts`) to handle email sending via Resend
- **Angular Email Service**: Created `EmailService` to communicate with the email server

### 2. Booking Approval Flow
The booking approval flow now includes:
1. Admin selects groomer and time slot
2. Booking is updated in Supabase with groomer assignment and confirmed status
3. Updated booking details are fetched (including groomer information)
4. Confirmation emails are sent to:
   - **Client**: Beautiful confirmation email with booking details
   - **Groomer**: Assignment notification with client and appointment details
   - **Admin**: Confirmation that booking was approved successfully

### 3. Rabies Certificate Fix
- Fixed the certificate viewing by converting storage paths to public URLs
- Certificates are stored in the `pet-certificates` bucket in Supabase Storage
- The view button now properly constructs public URLs for certificates

## Setup Instructions

### Prerequisites
- Node.js and npm installed
- Resend API key (already configured in `.env`)
- Supabase project (already configured)

### Installation
1. Dependencies are already installed (express, resend, cors, dotenv, ts-node)

### Running the Application

#### Option 1: Run Both Services Together (Recommended)
```bash
npm run dev
```
This starts both the email server (port 3001) and Angular app (port 4200).

#### Option 2: Run Services Separately
```bash
# Terminal 1 - Email Server
npm run email-server

# Terminal 2 - Angular App
npm start
```

## Email Server

### Endpoint
- **URL**: `http://localhost:3001/api/send-booking-approval-emails`
- **Method**: POST
- **Port**: 3001 (configurable via PORT environment variable)

### Health Check
```bash
curl http://localhost:3001/api/health
```

### Request Format
```json
{
  "booking": {
    "id": "booking-id",
    "scheduled_date": "2025-01-15",
    "scheduled_time_start": "09:00:00",
    "scheduled_time_end": "10:30:00",
    "address": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "total_amount": 85.00,
    "service_name": "Premium Grooming"
  },
  "client": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  },
  "groomer": {
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane@example.com"
  },
  "pets": [
    { "name": "Buddy" },
    { "name": "Max" }
  ],
  "adminEmail": "admin@royalpawzusa.com"
}
```

## Troubleshooting

### Email Server Issues

#### Email server not starting
```bash
# Check if port 3001 is already in use
lsof -i :3001

# Kill the process if needed
kill -9 <PID>

# Restart email server
npm run email-server
```

#### Emails not sending
1. Check that `RESEND_API_KEY` is set correctly in `.env`
2. Verify email server is running:
   ```bash
   curl http://localhost:3001/api/health
   ```
3. Check browser console for errors when approving bookings
4. Check email server logs in the terminal running `npm run email-server`

### Booking Approval Issues

#### "Failed to approve booking" error
This could be due to:

1. **RLS Policy Issue**: The admin user might not have the correct role
   ```sql
   -- Check current user's role
   SELECT id, role FROM users WHERE id = auth.uid();

   -- If role is not 'ADMIN', update it:
   UPDATE users SET role = 'ADMIN' WHERE email = 'your-admin-email@example.com';
   ```

2. **Authentication Issue**: Admin is not logged in
   - Make sure you're logged in as an admin user
   - Check browser console for auth errors

3. **Database Connection Issue**
   - Check Supabase connection in `environment.ts`
   - Verify Supabase credentials are correct

#### Approval succeeds but emails not sent
1. Check if email server is running
2. Check browser console for HTTP errors (e.g., connection refused to localhost:3001)
3. Verify `EmailService` is pointing to the correct URL (`http://localhost:3001/api`)

### Debugging

#### Enable Detailed Logging
The booking service now includes detailed console logging:
- Open browser DevTools → Console tab
- Attempt to approve a booking
- Look for logs showing:
  - Current user ID
  - Booking update attempt
  - Supabase error details (if any)
  - Email sending results

#### Common Error Codes
- **403 Forbidden**: User doesn't have permission (check RLS policies and user role)
- **401 Unauthorized**: User not authenticated
- **500 Internal Server Error**: Database or email server error
- **Connection Refused**: Email server not running

## Configuration

### Admin Email
To change the admin email that receives notifications, edit:
```typescript
// src/app/shared/components/booking-detail-modal/booking-detail-modal.component.ts
const adminEmail = 'admin@royalpawzusa.com'; // Change this
```

### Email Server Port
To change the email server port:
```bash
# In .env file
PORT=3002
```

### Email Templates
Email templates are defined in `server.ts`:
- `generateClientEmailHTML()` - Client confirmation email
- `generateGroomerEmailHTML()` - Groomer assignment email
- `generateAdminEmailHTML()` - Admin notification email

## Testing

### Test Email Sending
1. Start both services: `npm run dev`
2. Navigate to admin dashboard
3. Find a pending booking
4. Click "Approve & Assign Groomer"
5. Select a groomer and time slot
6. Click "Approve & Assign"
7. Check:
   - Browser console for logs
   - Email server terminal for sending logs
   - Email inboxes (client, groomer, admin)

### Test Rabies Certificate
1. Open a booking with pets that have rabies certificates
2. Click "View Rabies Certificate" button
3. Certificate should open in a new tab

## Supabase RLS Policies

The following policies control booking access:

### Admins
- **SELECT**: Can view all bookings (`is_current_user_admin()`)
- **UPDATE**: Can update all bookings (`is_current_user_admin()`)

### Clients
- **SELECT**: Can view their own bookings (`auth.uid() = client_id`)
- **INSERT**: Can create bookings for themselves
- **UPDATE**: Can update their own bookings

### Groomers
- **SELECT**: Can view assigned bookings (`auth.uid() = groomer_id`)
- **UPDATE**: Can update assigned bookings

## Support
If you encounter issues:
1. Check browser console for errors
2. Check email server terminal for logs
3. Verify all services are running
4. Check Supabase dashboard for RLS policy issues
5. Test email server health endpoint
