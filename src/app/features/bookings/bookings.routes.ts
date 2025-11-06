import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./bookings-list/bookings-list.component').then(m => m.BookingsListComponent)
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./create-booking/create-booking.component').then(m => m.CreateBookingComponent)
  }
];
