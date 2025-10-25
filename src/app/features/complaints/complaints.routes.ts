import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./complaints-list/complaints-list.component').then(m => m.ComplaintsListComponent)
  }
];
