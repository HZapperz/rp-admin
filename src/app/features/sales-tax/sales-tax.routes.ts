import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./sales-tax-dashboard/sales-tax-dashboard.component')
        .then(m => m.SalesTaxDashboardComponent)
  }
];
