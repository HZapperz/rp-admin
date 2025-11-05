import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, AuthSession } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

// Custom storage adapter with better lock handling
class CustomLocalStorage {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('LocalStorage getItem error:', error);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('LocalStorage setItem error:', error);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('LocalStorage removeItem error:', error);
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private _session$ = new BehaviorSubject<AuthSession | null>(null);

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          storage: typeof window !== 'undefined' ? new CustomLocalStorage() : undefined,
          storageKey: 'sb-auth-token',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      }
    );

    // Initialize session with retry logic
    this.initializeSession();

    // Listen to auth changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, session?.user?.id);
      this._session$.next(session);
    });
  }

  private async initializeSession(retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`Initializing session (attempt ${i + 1}/${retries})...`);
        const { data, error } = await this.supabase.auth.getSession();

        if (error) {
          console.error('Session initialization error:', error);
          if (i === retries - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        this._session$.next(data.session);
        console.log('Session initialized successfully:', data.session?.user?.id);
        return;
      } catch (err) {
        console.error(`Session init attempt ${i + 1} failed:`, err);
        if (i === retries - 1) {
          // Last attempt failed, set session to null
          this._session$.next(null);
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  }

  get session$(): Observable<AuthSession | null> {
    return this._session$.asObservable();
  }

  get session(): AuthSession | null {
    return this._session$.value;
  }

  // Method to wait for session initialization (used by APP_INITIALIZER)
  async waitForInitialization(): Promise<void> {
    // Wait up to 5 seconds for session to be set (either to a session or null)
    const timeout = 5000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const subscription = this._session$.subscribe(() => {
        // Session has been initialized (even if null)
        subscription.unsubscribe();
        resolve();
      });

      // Timeout fallback
      setTimeout(() => {
        subscription.unsubscribe();
        resolve();
      }, timeout);
    });
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  get auth() {
    return this.supabase.auth;
  }

  // Utility method for database queries
  from(table: string) {
    return this.supabase.from(table);
  }

  // Storage utilities
  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async uploadFile(
    bucket: string,
    path: string,
    file: File
  ): Promise<{ path: string; url: string } | null> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const url = this.getPublicUrl(bucket, data.path);
    return { path: data.path, url };
  }
}
