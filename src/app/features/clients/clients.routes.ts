import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./clients-list/clients-list.component').then(m => m.ClientsListComponent)
  }
];
