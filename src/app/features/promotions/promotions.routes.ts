import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./promotions-list/promotions-list.component').then(m => m.PromotionsListComponent)
  }
];
