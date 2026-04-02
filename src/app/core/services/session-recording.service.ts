import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

export interface SignupEvent {
  event: string;
  timestamp: string;
  field?: string;
  error?: string;
  errors?: Record<string, string>;
  userId?: string;
}

export interface SessionUser {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export interface RecordingSession {
  id: string;
  session_id: string;
  user_id: string | null;
  user_agent: string | null;
  screen_width: number | null;
  screen_height: number | null;
  initial_url: string | null;
  referrer: string | null;
  event_count: number;
  page_views: number;
  pages_visited: string[] | null;
  rage_clicks: number;
  console_errors: number;
  is_completed: boolean;
  is_converted: boolean;
  has_signed_up: boolean;
  signup_events: SignupEvent[] | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  user: SessionUser | null;
}

export interface RecordingSessionEvent {
  id: string;
  session_id: string;
  chunk_index: number;
  events: any[];
  event_count: number;
  first_timestamp: number | null;
  last_timestamp: number | null;
  created_at: string;
}

export interface AbandonedBooking {
  id: string;
  email: string | null;
  phone: string | null;
  last_step: string | null;
  session_data: any;
  recovery_link: string | null;
  created_at: string;
  updated_at: string | null;
  recovered_at: string | null;
  booking_id: string | null;
  user: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
}

export interface SessionFilters {
  status?: 'all' | 'converted' | 'dropped' | 'signed_up' | 'abandoned';
  hasRageClicks?: boolean;
  hideNoEvents?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface SessionAnalytics {
  totalSessions: number;
  signups: number;
  loggedIn: number;
  conversions: number;
  bounces: number;
  sessionsWithRageClicks: number;
  totalRageClicks: number;
  avgPageViews: number;
  bounceRate: number;
  signupRate: number;
  conversionRate: number;
  bookEntries: number;
  bookingRate: number;
}

@Injectable({
  providedIn: 'root'
})
export class SessionRecordingService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get list of recording sessions with optional filters
   */
  getSessions(filters?: SessionFilters, limit = 50): Observable<RecordingSession[]> {
    return from(this.fetchSessions(filters, limit));
  }

  private async fetchSessions(filters?: SessionFilters, limit = 50): Promise<RecordingSession[]> {
    let query = this.supabase.from('recording_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    // Apply filters
    if (filters?.status === 'converted') {
      query = query.eq('is_converted', true);
    } else if (filters?.status === 'dropped') {
      query = query.eq('is_converted', false);
    } else if (filters?.status === 'signed_up') {
      query = query.eq('has_signed_up', true).eq('is_converted', false);
    }

    if (filters?.hasRageClicks) {
      query = query.gt('rage_clicks', 0);
    }

    if (filters?.hideNoEvents) {
      query = query.gt('event_count', 0);
    }

    if (filters?.startDate) {
      query = query.gte('started_at', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('started_at', filters.endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }

    const sessions: RecordingSession[] = (data || []).map((s: any) => ({ ...s, user: null }));
    return this.attachUsers(sessions);
  }

  private async attachUsers(sessions: RecordingSession[]): Promise<RecordingSession[]> {
    const userIds = [...new Set(sessions.map(s => s.user_id).filter(Boolean))] as string[];
    if (userIds.length === 0) return sessions;

    const { data: users, error } = await this.supabase.from('users')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    if (error || !users) return sessions;

    const userMap = new Map(users.map((u: any) => [u.id, { first_name: u.first_name, last_name: u.last_name, email: u.email }]));

    return sessions.map(s => ({
      ...s,
      user: s.user_id ? userMap.get(s.user_id) || null : null
    }));
  }

  /**
   * Get abandoned bookings (contact info collected but booking not completed)
   */
  getAbandonedBookings(limit = 100): Observable<AbandonedBooking[]> {
    return from(this.fetchAbandonedBookings(limit));
  }

  private async fetchAbandonedBookings(limit: number): Promise<AbandonedBooking[]> {
    const { data, error } = await this.supabase.from('abandoned_bookings')
      .select('*')
      .is('recovered_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching abandoned bookings:', error);
      throw error;
    }

    const bookings: AbandonedBooking[] = (data || []).map((b: any) => ({ ...b, user: null }));
    return this.attachUsersToAbandoned(bookings);
  }

  private async attachUsersToAbandoned(bookings: AbandonedBooking[]): Promise<AbandonedBooking[]> {
    const emails = [...new Set(bookings.map(b => b.email).filter(Boolean))] as string[];
    if (emails.length === 0) return bookings;

    const { data: users, error } = await this.supabase.from('users')
      .select('id, email, first_name, last_name')
      .in('email', emails);

    if (error || !users) return bookings;

    const userMap = new Map(users.map((u: any) => [u.email, { id: u.id, first_name: u.first_name, last_name: u.last_name, email: u.email }]));

    return bookings.map(b => ({
      ...b,
      user: b.email ? userMap.get(b.email) || null : null,
    }));
  }

  /**
   * Get a single session by session_id
   */
  getSession(sessionId: string): Observable<RecordingSession | null> {
    return from(this.fetchSession(sessionId));
  }

  private async fetchSession(sessionId: string): Promise<RecordingSession | null> {
    const { data, error } = await this.supabase.from('recording_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      console.error('Error fetching session:', error);
      return null;
    }

    const session: RecordingSession = { ...data, user: null };
    if (session.user_id) {
      const { data: userData } = await this.supabase.from('users')
        .select('first_name, last_name, email')
        .eq('id', session.user_id)
        .single();
      if (userData) {
        session.user = userData;
      }
    }
    return session;
  }

  /**
   * Get events for a session (for replay)
   */
  getSessionEvents(sessionId: string): Observable<RecordingSessionEvent[]> {
    return from(this.fetchSessionEvents(sessionId));
  }

  private async fetchSessionEvents(sessionId: string): Promise<RecordingSessionEvent[]> {
    const { data, error } = await this.supabase.from('recording_session_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.error('Error fetching session events:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get funnel stats for dashboard
   */
  getFunnelStats(days = 7): Observable<{
    total: number;
    bookEntries: number;
    bookingRate: number;
    withRageClicks: number;
  }> {
    return from(this.fetchFunnelStats(days));
  }

  private async fetchFunnelStats(days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase.from('recording_sessions')
      .select('is_converted, rage_clicks, pages_visited, initial_url')
      .gte('started_at', startDate.toISOString());

    if (error) {
      console.error('Error fetching funnel stats:', error);
      throw error;
    }

    const sessions = data || [];
    const converted = sessions.filter(s => s.is_converted).length;
    const bookEntries = sessions.filter(s => {
      if (s.initial_url) {
        try {
          const path = new URL(s.initial_url).pathname;
          if (path === '/book' || path.startsWith('/book/')) return true;
        } catch {
          if (s.initial_url.includes('/book')) return true;
        }
      }
      const pages = s.pages_visited as string[] | null;
      return Array.isArray(pages) && pages.some(p => p === '/book');
    }).length;

    return {
      total: sessions.length,
      bookEntries,
      bookingRate: bookEntries > 0 ? Math.round((converted / bookEntries) * 1000) / 10 : 0,
      withRageClicks: sessions.filter(s => s.rage_clicks > 0).length,
    };
  }

  /**
   * Get detailed analytics for a time period
   */
  getAnalytics(period: 'week' | 'month' | 'quarter' | 'year' | 'all'): Observable<SessionAnalytics> {
    return from(this.fetchAnalytics(period));
  }

  private async fetchAnalytics(period: 'week' | 'month' | 'quarter' | 'year' | 'all'): Promise<SessionAnalytics> {
    const startDate = this.calculateStartDate(period);

    let query = this.supabase.from('recording_sessions')
      .select('page_views, has_signed_up, is_converted, rage_clicks, user_id, pages_visited, initial_url');

    if (startDate) {
      query = query.gte('started_at', startDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }

    const sessions = data || [];
    return this.calculateAnalytics(sessions);
  }

  private calculateStartDate(period: 'week' | 'month' | 'quarter' | 'year' | 'all'): Date | null {
    const now = new Date();
    switch (period) {
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'quarter':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'year':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'all':
        return null;
    }
  }

  private calculateAnalytics(sessions: Array<{
    page_views: number;
    has_signed_up: boolean;
    is_converted: boolean;
    rage_clicks: number;
    user_id: string | null;
    pages_visited: string[] | null;
    initial_url: string | null;
  }>): SessionAnalytics {
    const totalSessions = sessions.length;
    const signups = sessions.filter(s => s.has_signed_up).length;
    const loggedIn = sessions.filter(s => s.user_id && !s.has_signed_up).length;
    const conversions = sessions.filter(s => s.is_converted).length;
    const bounces = sessions.filter(s => s.page_views === 1).length;
    const sessionsWithRageClicks = sessions.filter(s => s.rage_clicks > 0).length;
    const totalRageClicks = sessions.reduce((sum, s) => sum + (s.rage_clicks || 0), 0);
    const totalPageViews = sessions.reduce((sum, s) => sum + (s.page_views || 0), 0);

    const bookEntries = sessions.filter(s => {
      if (s.initial_url) {
        try {
          const path = new URL(s.initial_url).pathname;
          if (path === '/book' || path.startsWith('/book/')) return true;
        } catch {
          if (s.initial_url.includes('/book')) return true;
        }
      }
      const pages = s.pages_visited as string[] | null;
      return Array.isArray(pages) && pages.some(p => p === '/book');
    }).length;

    const bookingRate = bookEntries > 0
      ? Math.round((conversions / bookEntries) * 1000) / 10
      : 0;

    return {
      totalSessions,
      signups,
      loggedIn,
      conversions,
      bounces,
      sessionsWithRageClicks,
      totalRageClicks,
      avgPageViews: totalSessions > 0 ? Math.round((totalPageViews / totalSessions) * 10) / 10 : 0,
      bounceRate: totalSessions > 0 ? Math.round((bounces / totalSessions) * 1000) / 10 : 0,
      signupRate: totalSessions > 0 ? Math.round((signups / totalSessions) * 1000) / 10 : 0,
      conversionRate: totalSessions > 0 ? Math.round((conversions / totalSessions) * 1000) / 10 : 0,
      bookEntries,
      bookingRate,
    };
  }

  /**
   * Parse user agent to get device info
   */
  parseUserAgent(userAgent: string | null): { device: string; browser: string } {
    if (!userAgent) {
      return { device: 'Unknown', browser: 'Unknown' };
    }

    // Simple device detection
    let device = 'Desktop';
    if (/iPhone/i.test(userAgent)) device = 'iPhone';
    else if (/iPad/i.test(userAgent)) device = 'iPad';
    else if (/Android/i.test(userAgent)) device = 'Android';
    else if (/Mobile/i.test(userAgent)) device = 'Mobile';

    // Simple browser detection
    let browser = 'Unknown';
    if (/Chrome/i.test(userAgent) && !/Edge/i.test(userAgent)) browser = 'Chrome';
    else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = 'Safari';
    else if (/Firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/Edge/i.test(userAgent)) browser = 'Edge';

    return { device, browser };
  }

  /**
   * Calculate session duration from events
   */
  calculateDuration(events: RecordingSessionEvent[]): number {
    if (events.length === 0) return 0;

    const firstTimestamp = events[0]?.first_timestamp || 0;
    const lastTimestamp = events[events.length - 1]?.last_timestamp || 0;

    return lastTimestamp - firstTimestamp;
  }

  /**
   * Format duration in ms to human readable
   */
  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) {
      return `${remainingSeconds}s`;
    }

    return `${minutes}m ${remainingSeconds}s`;
  }
}
