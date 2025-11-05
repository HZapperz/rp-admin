import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';
import { SupabaseService } from './core/services/supabase.service';

// Initialize auth before app starts
function initializeAuth(supabaseService: SupabaseService) {
  return () => supabaseService.waitForInitialization();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [SupabaseService],
      multi: true
    }
  ]
};
