import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./warm-leads-list/warm-leads-list.component').then(
        (m) => m.WarmLeadsListComponent
      ),
  },
];
