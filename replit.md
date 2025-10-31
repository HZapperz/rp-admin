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
- **2025-10-31**: Configured for Replit environment
  - Set dev server to port 5000 with host 0.0.0.0
  - Created vite.config.js with allowedHosts configuration for Replit proxy compatibility
  - Configured angular.json with host and port settings
  - Enhanced Supabase client configuration with explicit storage settings
  - Created workflow for Angular dev server
  - Configured deployment with build and run commands
  - Installed http-server for production deployments
  - Added replit.md documentation

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
