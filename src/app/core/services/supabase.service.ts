import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, AuthSession } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

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
          storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          storageKey: 'sb-auth-token',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      }
    );

    // Initialize session
    this.supabase.auth.getSession().then(({ data }) => {
      this._session$.next(data.session);
    });

    // Listen to auth changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      this._session$.next(session);
    });
  }

  get session$(): Observable<AuthSession | null> {
    return this._session$.asObservable();
  }

  get session(): AuthSession | null {
    return this._session$.value;
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
