import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

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
  started_at: string;
  ended_at: string | null;
  created_at: string;
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

export interface SessionFilters {
  status?: 'all' | 'converted' | 'dropped' | 'signed_up';
  hasRageClicks?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
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

    return data || [];
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

    return data;
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
    signedUp: number;
    converted: number;
    withRageClicks: number;
  }> {
    return from(this.fetchFunnelStats(days));
  }

  private async fetchFunnelStats(days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase.from('recording_sessions')
      .select('is_converted, has_signed_up, user_id, rage_clicks')
      .gte('started_at', startDate.toISOString());

    if (error) {
      console.error('Error fetching funnel stats:', error);
      throw error;
    }

    const sessions = data || [];
    return {
      total: sessions.length,
      signedUp: sessions.filter(s => s.has_signed_up || s.user_id).length,
      converted: sessions.filter(s => s.is_converted).length,
      withRageClicks: sessions.filter(s => s.rage_clicks > 0).length,
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
