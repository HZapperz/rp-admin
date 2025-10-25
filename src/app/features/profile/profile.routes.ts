import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./profile-settings/profile-settings.component').then(m => m.ProfileSettingsComponent)
  }
];
