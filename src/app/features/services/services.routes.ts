import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./services-list/services-list.component').then(
        (m) => m.ServicesListComponent
      ),
  },
];
