import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./incidents-list/incidents-list.component').then(
        (m) => m.IncidentsListComponent
      ),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./incident-details/incident-details.component').then(
        (m) => m.IncidentDetailsComponent
      ),
  },
];
