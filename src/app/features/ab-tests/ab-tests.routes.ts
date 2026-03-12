import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./ab-tests.component').then(m => m.AbTestsComponent)
  }
];
