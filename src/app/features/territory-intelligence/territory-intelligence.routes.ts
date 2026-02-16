import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./territory-dashboard/territory-dashboard.component')
        .then(m => m.TerritoryDashboardComponent)
  }
];
