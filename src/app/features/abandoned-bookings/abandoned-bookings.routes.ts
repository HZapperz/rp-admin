import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./abandoned-list.component').then(m => m.AbandonedListComponent)
  }
];
