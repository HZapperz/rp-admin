import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./sessions-list/sessions-list.component').then(m => m.SessionsListComponent)
  },
  {
    path: ':sessionId',
    loadComponent: () =>
      import('./session-detail/session-detail.component').then(m => m.SessionDetailComponent)
  }
];
