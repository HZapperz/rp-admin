import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./service-areas-list/service-areas-list.component').then(m => m.ServiceAreasListComponent)
  }
];
