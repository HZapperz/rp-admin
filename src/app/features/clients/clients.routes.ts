import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./clients-list/clients-list.component').then(m => m.ClientsListComponent)
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./client-detail/client-detail.component').then(m => m.ClientDetailComponent)
  }
];
