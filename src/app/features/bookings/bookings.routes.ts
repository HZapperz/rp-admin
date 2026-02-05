import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./bookings-list/bookings-list.component').then(m => m.BookingsListComponent)
  },
  {
    path: 'rebookings',
    loadComponent: () =>
      import('./rebookings-list/rebookings-list.component').then(m => m.RebookingsListComponent)
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./create-booking/create-booking.component').then(m => m.CreateBookingComponent)
  },
  {
    path: 'details/:id',
    loadComponent: () =>
      import('./booking-details/booking-details.component').then(m => m.BookingDetailsComponent)
  }
];
