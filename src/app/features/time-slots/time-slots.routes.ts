import { Routes } from '@angular/router';

export const TIME_SLOTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./time-slots-list/time-slots-list.component').then(
        (m) => m.TimeSlotsListComponent
      ),
  },
];
