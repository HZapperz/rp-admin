import { Routes } from '@angular/router';

export const VANS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./van-management/van-management.component').then((m) => m.VanManagementComponent),
  },
  {
    path: 'roster',
    loadComponent: () =>
      import('./van-roster/van-roster.component').then((m) => m.VanRosterComponent),
  },
];
