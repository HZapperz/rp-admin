import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, map, tap } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AuthUser, UserRole } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private _currentUser$ = new BehaviorSubject<AuthUser | null>(null);
  private _isAuthenticated$ = new BehaviorSubject<boolean>(false);

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

  private async initAuth() {
    // Check for existing session
    const session = this.supabase.session;
    if (session?.user) {
      await this.loadUserProfile(session.user.id);
    }

    // Listen to auth state changes
    this.supabase.session$.subscribe(async (session) => {
      if (session?.user) {
        await this.loadUserProfile(session.user.id);
      } else {
        this._currentUser$.next(null);
        this._isAuthenticated$.next(false);
      }
    });
  }

  private async loadUserProfile(userId: string): Promise<void> {
    console.log('Loading user profile for ID:', userId);

    const { data, error } = await this.supabase
      .from('users')
      .select('id, role, email, phone, first_name, last_name')
      .eq('id', userId)
      .single();

    console.log('User profile query result:', { data, error });

    if (error) {
      console.error('Error loading user profile:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      this._currentUser$.next(null);
      this._isAuthenticated$.next(false);
      return;
    }

    if (!data) {
      console.error('No user data returned from query');
      this._currentUser$.next(null);
      this._isAuthenticated$.next(false);
      return;
    }

    console.log('User role from database:', data.role);

    // Only allow ADMIN role
    if (data.role !== 'ADMIN') {
      console.warn('Non-admin user attempted to access admin panel. Role:', data.role);
      await this.signOut();
      return;
    }

    console.log('Admin role confirmed, proceeding with authentication');

    const user: AuthUser = {
      id: data.id,
      role: data.role as UserRole,
      name: `${data.first_name} ${data.last_name}`,
      email: data.email,
      phone: data.phone
    };

    this._currentUser$.next(user);
    this._isAuthenticated$.next(true);
  }

  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data.user) {
        return { success: false, error: 'No user data returned' };
      }

      // Load user profile to check role
      await this.loadUserProfile(data.user.id);

      if (!this.currentUser || this.currentUser.role !== 'ADMIN') {
        await this.signOut();
        return { success: false, error: 'Access denied. Admin role required.' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Sign in failed' };
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this._currentUser$.next(null);
    this._isAuthenticated$.next(false);
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
