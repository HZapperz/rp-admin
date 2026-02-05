import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LoginComponent } from './auth/login/login.component';
import { LayoutComponent } from './shared/components/layout/layout.component';

export const routes: Routes = [
  {
    path: 'auth/login',
    component: LoginComponent
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'bookings',
        loadChildren: () =>
          import('./features/bookings/bookings.routes').then(m => m.routes)
      },
      {
        path: 'change-requests',
        loadChildren: () =>
          import('./features/change-requests/change-requests.routes').then(m => m.routes)
      },
      {
        path: 'clients',
        loadChildren: () =>
          import('./features/clients/clients.routes').then(m => m.routes)
      },
      {
        path: 'warm-leads',
        loadChildren: () =>
          import('./features/warm-leads/warm-leads.routes').then(m => m.routes)
      },
      {
        path: 'fill-schedule',
        loadChildren: () =>
          import('./features/fill-schedule/fill-schedule.routes').then(m => m.routes)
      },
      {
        path: 'groomers',
        loadChildren: () =>
          import('./features/groomers/groomers.routes').then(m => m.routes)
      },
      {
        path: 'analytics',
        loadChildren: () =>
          import('./features/analytics/analytics.routes').then(m => m.routes)
      },
      {
        path: 'reports',
        loadChildren: () =>
          import('./features/reports/reports.routes').then(m => m.routes)
      },
      {
        path: 'promotions',
        loadChildren: () =>
          import('./features/promotions/promotions.routes').then(m => m.routes)
      },
      {
        path: 'complaints',
        loadChildren: () =>
          import('./features/complaints/complaints.routes').then(m => m.routes)
      },
      {
        path: 'service-areas',
        loadChildren: () =>
          import('./features/service-areas/service-areas.routes').then(m => m.routes)
      },
      {
        path: 'services',
        loadChildren: () =>
          import('./features/services/services.routes').then(m => m.routes)
      },
      {
        path: 'profile',
        loadChildren: () =>
          import('./features/profile/profile.routes').then(m => m.routes)
      },
      {
        path: 'sessions',
        loadChildren: () =>
          import('./features/sessions/sessions.routes').then(m => m.routes)
      },
      {
        path: 'sms-inbox',
        loadChildren: () =>
          import('./features/sms-inbox/sms-inbox.routes').then(m => m.routes)
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
