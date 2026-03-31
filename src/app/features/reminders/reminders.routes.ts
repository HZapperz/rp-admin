import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./reminders.component').then(m => m.RemindersComponent)
  }
];
