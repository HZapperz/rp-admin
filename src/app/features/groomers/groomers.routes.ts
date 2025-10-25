import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./groomers-list/groomers-list.component').then(m => m.GroomersListComponent)
  }
];
