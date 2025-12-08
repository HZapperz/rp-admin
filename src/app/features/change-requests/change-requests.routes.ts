import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./change-requests-list/change-requests-list.component').then(m => m.ChangeRequestsListComponent)
  }
];
