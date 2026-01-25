import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pricing-analysis/pricing-analysis.component').then(m => m.PricingAnalysisComponent)
  }
];
