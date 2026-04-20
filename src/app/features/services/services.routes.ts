import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./services-list/services-list.component').then(
        (m) => m.ServicesListComponent
      ),
  },
  {
    path: 'breeds',
    loadComponent: () =>
      import('./breeds-editor/breeds-editor.component').then(
        (m) => m.BreedsEditorComponent
      ),
  },
  {
    path: 'breed-premiums',
    loadComponent: () =>
      import('./breed-premiums-editor/breed-premiums-editor.component').then(
        (m) => m.BreedPremiumsEditorComponent
      ),
  },
];
