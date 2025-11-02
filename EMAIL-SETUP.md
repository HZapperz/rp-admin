# Email Confirmation Setup for Royal Pawz

## Overview
This application sends confirmation emails to clients, groomers, and admins when a booking is approved.

## Architecture

### Development Mode
- **Angular App**: Runs on `http://localhost:5000`
- **Email Server**: Runs on `http://localhost:3001`
- Angular app makes API calls to the email server on port 3001

### Production Mode (Replit)
- **Single Server**: Runs on port 5000 (or whatever PORT env variable is set to)
- The production server (`production-server.js`) handles:
  - Email API endpoints at `/api/*`
  - Serves the Angular static files for all other routes

## How It Works

1. **Admin approves booking** in the booking modal
2. **Angular EmailService** sends POST request to `/api/send-booking-approval-emails`
3. **Email Server** receives request and sends 3 emails via Resend:
   - Client confirmation email
   - Groomer assignment email
   - Admin notification email (optional)

## Running Locally

### Start Both Servers
```bash
# Option 1: Run both servers separately
npm run email-server  # Terminal 1 (port 3001)
npm start            # Terminal 2 (port 5000)

# Option 2: Run both together
npm run dev          # Starts both servers
```

### Environment Variables Required
```env
RESEND_API_KEY=your_resend_api_key
FROM_EMAIL=onboarding@resend.dev  # or your verified domain
```

## Deploying to Replit

### 1. Set Environment Variables in Replit Secrets
- `RESEND_API_KEY`: Your Resend API key
- `FROM_EMAIL`: Email address to send from (use `onboarding@resend.dev` for testing)

### 2. Deploy
Replit will automatically:
- Run `npm run build` to build the Angular app
- Run `node production-server.js` to start the combined server
- Serve both the Angular app and email API on a single port

### 3. Verify
- Visit your Replit URL - Angular app should load
- Check `/api/health` endpoint returns: `{"status":"ok","service":"Royal Pawz Email Service"}`

## Email Configuration

### Using Resend Test Domain (Development)
```env
FROM_EMAIL=onboarding@resend.dev
```
This is Resend's test domain and will work immediately. Emails sent from this domain may be rate-limited.

### Using Your Own Domain (Production)
1. Verify your domain in Resend dashboard
2. Update environment variable:
```env
FROM_EMAIL=noreply@yourdomain.com
```

## Troubleshooting

### Emails Not Sending
1. **Check email server is running**: Visit `http://localhost:3001/api/health` (dev) or `your-replit-url/api/health` (prod)
2. **Check Resend API key**: Look for "Resend API Key configured: true" in server logs
3. **Check console logs**: Look for error messages in both Angular and server logs

### Development Issues
- Make sure both servers are running (ports 3001 and 5000)
- Check that `.env` file exists with `RESEND_API_KEY`
- Verify email server starts without TypeScript errors

### Production Issues
- Verify environment variables are set in Replit Secrets
- Check that Angular build completed successfully
- Make sure `production-server.js` is running (check Replit console logs)

## Files Modified
- `src/app/core/services/email.service.ts` - Updated to use relative URLs in production
- `server.ts` - Fixed TypeScript errors
- `production-server.js` - Combined server with email API
- `.env` - Added FROM_EMAIL configuration
- `.replit` - Updated to run both servers in development

## Testing
To test email sending locally without actually sending emails, you can:
1. Check Resend dashboard for email logs
2. Use Resend's test mode
3. Add console.log statements in `production-server.js` to see email payload
