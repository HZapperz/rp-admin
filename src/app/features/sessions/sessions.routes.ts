import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./sessions-list/sessions-list.component').then(m => m.SessionsListComponent)
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./sessions-analytics/sessions-analytics.component').then(m => m.SessionsAnalyticsComponent)
  },
  {
    path: ':sessionId',
    loadComponent: () =>
      import('./session-detail/session-detail.component').then(m => m.SessionDetailComponent)
  }
];
