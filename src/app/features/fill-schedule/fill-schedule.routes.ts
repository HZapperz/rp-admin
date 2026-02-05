import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./fill-schedule-view/fill-schedule-view.component').then(
        (m) => m.FillScheduleViewComponent
      ),
  },
];
