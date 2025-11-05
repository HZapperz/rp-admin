# Royal Pawz Admin Panel

## Overview
Angular 19-based admin panel for Royal Pawz pet grooming service. This application connects to a Supabase backend and provides administrative functionality for managing bookings, clients, groomers, promotions, and analytics.

## Project Architecture
- **Framework**: Angular 19 with standalone components
- **Language**: TypeScript 5.7
- **Styling**: SCSS + Angular Material v19
- **Backend**: Supabase (PostgreSQL database, authentication, storage)
- **Build Tool**: Angular CLI
- **Package Manager**: npm

## Project Structure
```
admin-app/
├── src/
│   ├── app/
│   │   ├── auth/              # Authentication (login)
│   │   ├── core/              # Services, guards, models
│   │   │   ├── guards/        # Route guards (auth)
│   │   │   ├── models/        # TypeScript interfaces
│   │   │   └── services/      # Business logic services
│   │   ├── features/          # Feature modules (bookings, clients, etc.)
│   │   └── shared/            # Shared components (layout)
│   ├── environments/          # Environment configuration
│   └── styles.scss           # Global styles
├── angular.json              # Angular CLI configuration
└── package.json             # Dependencies
```

## Recent Changes
- **2025-11-05**: Enhanced cache busting with triple-layer protection
  - Added HTTP-EQUIV meta tags directly in `src/index.html` (Cache-Control, Pragma, Expires)
  - These meta tags force browsers to NEVER cache the index.html file
  - Combined with server-side headers for maximum compatibility across all browsers
  - Angular automatically generates unique content-hashed filenames for JS/CSS on every build
  - Triple-layer protection ensures users ALWAYS get the latest version after republish

- **2025-11-02**: Implemented cache busting and integrated email service for deployments
  - Created `production-server.js` with Express to handle both Angular app and email API
  - Integrated Resend email service for booking approval emails (sends to client, groomer, and admin)
  - Email API endpoint: `/api/send-booking-approval-emails` (POST)
  - HTML files: `no-cache, no-store, must-revalidate` (always fetch latest)
  - Static assets (JS/CSS/images): `max-age=31536000, immutable` (cache for 1 year since Angular generates content-hashed filenames)
  - Updated deployment config to use production server instead of http-server
  - Removed separate Email Server workflow (now integrated into production server)

- **2025-10-31**: Configured for Replit environment
  - Set dev server to port 5000 with host 0.0.0.0
  - Created vite.config.js with allowedHosts configuration for Replit proxy compatibility
  - Configured angular.json with host and port settings
  - Enhanced Supabase client configuration with explicit storage settings
  - Created workflow for Angular dev server
  - Configured deployment with build and run commands
  - Increased Angular budget limits (component styles: 12kB, initial bundle: 1.5MB) to accommodate dashboard component
  - Installed http-server for production deployments
  - Added replit.md documentation
  - Production build verified and working

## Environment Configuration
The application uses Supabase for backend services:
- **Development**: `src/environments/environment.ts`
- **Production**: `src/environments/environment.prod.ts`

Supabase credentials are already configured in the environment files.

## Key Features
- **Authentication**: Admin-only access with role validation
- **Dashboard**: KPI cards and overview
- **Bookings Management**: View and manage service bookings
- **Client Management**: Track customers and their pets
- **Groomer Management**: Manage service providers
- **Analytics**: Reports and business insights
- **Promotions**: Campaign management
- **Service Areas**: Geographic coverage configuration

## Development
- **Port**: 5000 (configured for Replit webview)
- **Host**: 0.0.0.0 (allows iframe proxy access)
- **Dev Server**: Angular CLI development server with hot reload

## User Preferences
None specified yet.

## Dependencies
- @angular/core, @angular/material - Core Angular framework and UI components
- @supabase/supabase-js - Supabase client for backend services
- date-fns - Date utility library
- rxjs - Reactive programming library
