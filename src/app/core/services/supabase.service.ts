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
  private _initialized = false;
  private _initResolvers: (() => void)[] = [];

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

    // onAuthStateChange fires INITIAL_SESSION on startup — no need for a separate getSession() call
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, session?.user?.id);
      this._session$.next(session);
      if (!this._initialized) {
        this._initialized = true;
        this._initResolvers.forEach(r => r());
        this._initResolvers = [];
      }
    });
  }

  get session$(): Observable<AuthSession | null> {
    return this._session$.asObservable();
  }

  get session(): AuthSession | null {
    return this._session$.value;
  }

  // Method to wait for session initialization (used by APP_INITIALIZER)
  async waitForInitialization(): Promise<void> {
    if (this._initialized) return;
    return new Promise((resolve) => {
      this._initResolvers.push(resolve);
      // Timeout fallback — resolve after 5s even if INITIAL_SESSION never fires
      setTimeout(() => {
        if (!this._initialized) {
          this._initialized = true;
          resolve();
        }
      }, 5000);
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
    // Manually construct the URL to ensure it uses our custom domain
    // Format: {supabase_url}/storage/v1/object/public/{bucket}/{path}
    const baseUrl = environment.supabase.url;

    // Clean up the path - remove leading slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    // Handle case where bucket name might be duplicated in path
    const pathWithoutBucket = cleanPath.startsWith(`${bucket}/`)
      ? cleanPath.slice(bucket.length + 1)
      : cleanPath;

    return `${baseUrl}/storage/v1/object/public/${bucket}/${pathWithoutBucket}`;
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
