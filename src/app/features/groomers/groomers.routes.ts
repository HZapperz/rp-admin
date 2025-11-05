import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./groomers-list/groomers-list.component').then(m => m.GroomersListComponent)
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./groomer-detail/groomer-detail.component').then(m => m.GroomerDetailComponent)
  }
];
