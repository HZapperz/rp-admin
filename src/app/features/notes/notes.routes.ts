import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./notes-list/notes-list.component').then(m => m.NotesListComponent)
  }
];
