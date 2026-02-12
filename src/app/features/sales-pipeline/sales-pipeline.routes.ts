import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/pipeline-board/pipeline-board.component').then(m => m.PipelineBoardComponent)
  },
  {
    path: 'lead/:id',
    loadComponent: () =>
      import('./components/lead-detail/lead-detail.component').then(m => m.LeadDetailComponent)
  },
  {
    path: 'opt-outs',
    loadComponent: () =>
      import('./components/opt-outs-list/opt-outs-list.component').then(m => m.OptOutsListComponent)
  }
];
