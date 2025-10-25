# Royal Pawz Admin Panel (Angular)

This is the Angular-based admin panel for Royal Pawz, separated from the main Next.js client-groomer application. This admin application connects to the same Supabase database but provides admin-specific functionality.

## Project Status

### ✅ Completed Features

1. **Angular Project Setup**
   - Angular 19 with standalone components
   - TypeScript configuration
   - SCSS styling
   - Routing configured

2. **Dependencies Installed**
   - `@supabase/supabase-js` - Database and authentication
   - `@angular/material` v19 - UI component library
   - `date-fns` - Date utilities

3. **Core Infrastructure**
   - **Supabase Service** (`src/app/core/services/supabase.service.ts`)
     - Supabase client initialization
     - Auth state management
     - Database query helpers
     - File upload utilities

   - **Auth Service** (`src/app/core/services/auth.service.ts`)
     - Admin-only authentication
     - Role validation (rejects non-ADMIN users)
     - Sign in/out functionality
     - Password reset support
     - User profile loading from database

   - **Auth Guard** (`src/app/core/guards/auth.guard.ts`)
     - Route protection
     - Automatic redirect to login for unauthenticated users
     - Return URL support

4. **Type Definitions**
   - Complete TypeScript interfaces ported from Next.js app
   - Located in `src/app/core/models/types.ts`
   - Includes: User, Pet, Booking, Service, Complaint, Promotion, etc.

5. **Authentication Flow**
   - Login page (`src/app/auth/login/`)
     - Beautiful gradient design
     - Form validation
     - Error handling
     - Forgot password link (placeholder)

6. **Admin Layout**
   - Responsive sidebar navigation
   - Header with menu toggle
   - User profile display
   - Sign out functionality
   - Route-based active states

7. **Dashboard**
   - Basic dashboard with KPI cards
   - Placeholder for real data
   - Responsive grid layout

8. **Routing**
   - Protected routes with auth guard
   - Lazy-loaded feature modules
   - Redirect handling

### ⏳ Pending Features

The following features need to be implemented:

1. **Bookings Management** - View, approve/reject, assign groomers
2. **Clients Management** - View, search, block/unblock clients
3. **Groomers Management** - View, ratings, performance metrics
4. **Analytics & Reports** - Charts, CSV export, trends
5. **Promotions Management** - Create, edit, track promotions
6. **Complaints Management** - View, resolve complaints
7. **Service Areas Configuration** - Manage service zones
8. **Admin Profile** - Update profile, change password

## Setup Instructions

### 1. Configure Supabase

Update `src/environments/environment.ts` with your Supabase credentials:

```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'https://your-project.supabase.co',
    anonKey: 'your-anon-key'
  }
};
```

### 2. Run Development Server

```bash
npm start
# or
ng serve
```

Navigate to `http://localhost:4200/`

### 3. Build for Production

```bash
ng build --configuration production
```

## Authentication

This application only allows users with `role = 'ADMIN'` in the Supabase `users` table.

### Creating Admin Users

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@royalpawz.com';
```

## Project Structure

```
admin-view/
├── src/app/
│   ├── core/              # Services, guards, models
│   ├── shared/            # Shared components (Layout)
│   ├── features/          # Feature modules
│   └── auth/              # Login component
├── src/environments/      # Configuration
└── README.md
```

## Technology Stack

- **Framework:** Angular 19
- **Language:** TypeScript 5.6+
- **Database:** Supabase
- **Styling:** SCSS
- **UI:** Angular Material v19

## Next Steps

1. Test the foundation - login with an admin account
2. Build feature services (BookingService, ClientService, etc.)
3. Implement feature modules starting with Bookings
4. Connect to Supabase database
5. Deploy to production
