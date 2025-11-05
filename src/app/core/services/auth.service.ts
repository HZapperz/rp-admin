import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, map, tap } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthUser, UserRole } from '../models/types';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private _currentUser$ = new BehaviorSubject<AuthUser | null>(null);
  private _isAuthenticated$ = new BehaviorSubject<boolean>(false);
  private _loadingState$ = new BehaviorSubject<LoadingState>('idle');

  private readonly PROFILE_CACHE_KEY = 'rp_admin_profile_cache';
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {
    this.initAuth();
  }

  get currentUser$(): Observable<AuthUser | null> {
    return this._currentUser$.asObservable();
  }

  get currentUser(): AuthUser | null {
    return this._currentUser$.value;
  }

  get isAuthenticated$(): Observable<boolean> {
    return this._isAuthenticated$.asObservable();
  }

  get isAuthenticated(): boolean {
    return this._isAuthenticated$.value;
  }

  get loadingState$(): Observable<LoadingState> {
    return this._loadingState$.asObservable();
  }

  get loadingState(): LoadingState {
    return this._loadingState$.value;
  }

  private async initAuth() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AUTH] Initializing authentication service`);

    // Check for existing session
    const session = this.supabase.session;
    if (session?.user) {
      console.log(`[${timestamp}] [AUTH] Existing session found for user:`, session.user.id);
      await this.loadUserProfile(session.user.id);
    } else {
      console.log(`[${timestamp}] [AUTH] No existing session found`);
    }

    // Listen to auth state changes
    this.supabase.session$.subscribe(async (session) => {
      const subTimestamp = new Date().toISOString();
      if (session?.user) {
        console.log(`[${subTimestamp}] [AUTH] Session state changed - user signed in:`, session.user.id);
        await this.loadUserProfile(session.user.id);
      } else {
        console.log(`[${subTimestamp}] [AUTH] Session state changed - user signed out`);
        this._currentUser$.next(null);
        this._isAuthenticated$.next(false);
        this._loadingState$.next('idle');
      }
    });
  }

  private async loadUserProfile(userId: string): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AUTH] Loading user profile for ID:`, userId);

    this._loadingState$.next('loading');

    // Try to load from cache first
    const cachedProfile = this.getCachedProfile(userId);
    if (cachedProfile) {
      console.log(`[${timestamp}] [AUTH] Using cached profile (valid until ${new Date(cachedProfile.expiresAt).toISOString()})`);
      this.setAuthenticatedUser(cachedProfile.user);
      // Refresh in background
      this.refreshProfileInBackground(userId);
      return;
    }

    // Load from database with retry logic
    await this.loadProfileWithRetry(userId);
  }

  private async loadProfileWithRetry(userId: string, attempt: number = 1, maxAttempts: number = 3): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AUTH] Profile load attempt ${attempt}/${maxAttempts}`);

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, role, email, phone, first_name, last_name')
        .eq('id', userId)
        .single();

      console.log(`[${timestamp}] [AUTH] Database query completed:`, {
        hasData: !!data,
        hasError: !!error,
        errorCode: error?.code,
        errorMessage: error?.message
      });

      // Handle different error scenarios
      if (error) {
        console.error(`[${timestamp}] [AUTH] Database error:`, {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });

        // Retry on network/temporary errors
        if (this.isRetryableError(error) && attempt < maxAttempts) {
          const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`[${timestamp}] [AUTH] Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
          return this.loadProfileWithRetry(userId, attempt + 1, maxAttempts);
        }

        // Non-retryable error or max attempts reached
        console.error(`[${timestamp}] [AUTH] Failed to load profile after ${attempt} attempts`);
        this._loadingState$.next('error');
        this._currentUser$.next(null);
        this._isAuthenticated$.next(false);
        return;
      }

      if (!data) {
        console.error(`[${timestamp}] [AUTH] No user data returned from query`);
        this._loadingState$.next('error');
        this._currentUser$.next(null);
        this._isAuthenticated$.next(false);
        return;
      }

      console.log(`[${timestamp}] [AUTH] User role from database:`, data.role);

      // Only allow ADMIN role - this is an explicit role mismatch, not an error
      if (data.role !== 'ADMIN') {
        console.warn(`[${timestamp}] [AUTH] Non-admin user attempted to access admin panel. Role: ${data.role}`);
        this._loadingState$.next('error');
        await this.signOut();
        return;
      }

      console.log(`[${timestamp}] [AUTH] Admin role confirmed, authentication successful`);

      const user: AuthUser = {
        id: data.id,
        role: data.role as UserRole,
        name: `${data.first_name} ${data.last_name}`,
        email: data.email,
        phone: data.phone
      };

      // Cache the profile
      this.cacheProfile(userId, user);

      this.setAuthenticatedUser(user);
    } catch (error: any) {
      console.error(`[${timestamp}] [AUTH] Unexpected error loading profile:`, error);

      // Retry on unexpected errors
      if (attempt < maxAttempts) {
        const delayMs = Math.pow(2, attempt) * 1000;
        console.log(`[${timestamp}] [AUTH] Retrying after unexpected error in ${delayMs}ms...`);
        await this.delay(delayMs);
        return this.loadProfileWithRetry(userId, attempt + 1, maxAttempts);
      }

      this._loadingState$.next('error');
      this._currentUser$.next(null);
      this._isAuthenticated$.next(false);
    }
  }

  private setAuthenticatedUser(user: AuthUser): void {
    this._currentUser$.next(user);
    this._isAuthenticated$.next(true);
    this._loadingState$.next('success');
  }

  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, or temporary database issues
    const retryableCodes = ['PGRST301', 'PGRST302', '08000', '08003', '08006', '57P03'];
    return retryableCodes.includes(error.code) ||
           error.message?.includes('timeout') ||
           error.message?.includes('network') ||
           error.message?.includes('connection');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCachedProfile(userId: string): { user: AuthUser; expiresAt: number } | null {
    try {
      const cached = localStorage.getItem(this.PROFILE_CACHE_KEY);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      if (parsed.userId !== userId) {
        // Different user, clear cache
        localStorage.removeItem(this.PROFILE_CACHE_KEY);
        return null;
      }

      if (Date.now() > parsed.expiresAt) {
        // Cache expired
        localStorage.removeItem(this.PROFILE_CACHE_KEY);
        return null;
      }

      return { user: parsed.user, expiresAt: parsed.expiresAt };
    } catch (error) {
      console.error('[AUTH] Error reading profile cache:', error);
      localStorage.removeItem(this.PROFILE_CACHE_KEY);
      return null;
    }
  }

  private cacheProfile(userId: string, user: AuthUser): void {
    try {
      const cache = {
        userId,
        user,
        expiresAt: Date.now() + this.CACHE_DURATION_MS,
        cachedAt: Date.now()
      };
      localStorage.setItem(this.PROFILE_CACHE_KEY, JSON.stringify(cache));
      console.log(`[${new Date().toISOString()}] [AUTH] Profile cached until ${new Date(cache.expiresAt).toISOString()}`);
    } catch (error) {
      console.error('[AUTH] Error caching profile:', error);
    }
  }

  private async refreshProfileInBackground(userId: string): Promise<void> {
    // Silently refresh the profile without affecting current auth state
    console.log(`[${new Date().toISOString()}] [AUTH] Refreshing profile in background`);

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, role, email, phone, first_name, last_name')
        .eq('id', userId)
        .single();

      if (data && !error && data.role === 'ADMIN') {
        const user: AuthUser = {
          id: data.id,
          role: data.role as UserRole,
          name: `${data.first_name} ${data.last_name}`,
          email: data.email,
          phone: data.phone
        };
        this.cacheProfile(userId, user);
        this._currentUser$.next(user);
        console.log(`[${new Date().toISOString()}] [AUTH] Background refresh successful`);
      } else if (data && data.role !== 'ADMIN') {
        // Role changed, sign out
        console.warn(`[${new Date().toISOString()}] [AUTH] Role changed to ${data.role}, signing out`);
        await this.signOut();
      }
    } catch (error) {
      console.error('[AUTH] Background refresh failed:', error);
      // Don't affect current auth state on background refresh failure
    }
  }

  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AUTH] Sign in attempt for email:`, email);

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error(`[${timestamp}] [AUTH] Sign in failed:`, error.message);
        return { success: false, error: error.message };
      }

      if (!data.user) {
        console.error(`[${timestamp}] [AUTH] Sign in failed: No user data returned`);
        return { success: false, error: 'No user data returned' };
      }

      console.log(`[${timestamp}] [AUTH] Sign in successful, loading user profile...`);

      // Load user profile to check role
      await this.loadUserProfile(data.user.id);

      if (!this.currentUser || this.currentUser.role !== 'ADMIN') {
        console.warn(`[${timestamp}] [AUTH] Sign in rejected: User is not an admin`);
        await this.signOut();
        return { success: false, error: 'Access denied. Admin role required.' };
      }

      console.log(`[${timestamp}] [AUTH] Sign in completed successfully`);
      return { success: true };
    } catch (error: any) {
      console.error(`[${timestamp}] [AUTH] Sign in exception:`, error);
      return { success: false, error: error.message || 'Sign in failed' };
    }
  }

  async signOut(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [AUTH] Signing out user`);

    // Clear profile cache
    try {
      localStorage.removeItem(this.PROFILE_CACHE_KEY);
      console.log(`[${timestamp}] [AUTH] Profile cache cleared`);
    } catch (error) {
      console.error('[AUTH] Error clearing profile cache:', error);
    }

    await this.supabase.auth.signOut();
    this._currentUser$.next(null);
    this._isAuthenticated$.next(false);
    this._loadingState$.next('idle');
    this.router.navigate(['/auth/login']);
  }

  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Password reset failed' };
    }
  }

  async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Password update failed' };
    }
  }
}
