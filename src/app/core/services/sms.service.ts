/**
 * SMS Service for Angular Admin
 *
 * Provides methods for interacting with SMS conversations.
 */

import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, from } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

// Types
export interface SMSConversation {
  id: string;
  user_id: string | null;
  user_type: 'client' | 'groomer' | 'admin';
  phone_number: string;
  status: 'active' | 'resolved' | 'escalated';
  escalated_at: string | null;
  escalated_reason: string | null;
  assigned_admin_id: string | null;
  booking_id: string | null;
  last_message_at: string;
  unread_count: number;
  created_at: string;
  updated_at: string;
  user_name?: string;
  last_message?: string;
}

export interface SMSMessage {
  id: string;
  conversation_id: string | null;
  direction: 'inbound' | 'outbound';
  message_type: 'notification' | 'reply' | 'ai_response' | 'admin_response' | 'system' | null;
  notification_type: string | null;
  content: string;
  media_urls: string[];
  twilio_sid: string | null;
  twilio_status: string | null;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  ai_intent: string | null;
  ai_confidence: number | null;
  created_at: string;
}

export interface ConversationStats {
  active_conversations: number;
  escalated_conversations: number;
  resolved_conversations: number;
  unread_conversations: number;
  messages_sent_today: number;
}

export interface SendReplyRequest {
  content: string;
  phone: string;
  media_urls?: string[];
}

const CACHE_KEY = 'rp_sms_conversations_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ConversationsCache {
  conversations: SMSConversation[];
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class SMSService {
  private supabaseService = inject(SupabaseService);
  private get supabase() { return this.supabaseService.client; }

  // Observable for unread count (for sidebar badge)
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  // In-memory cache — survives navigation within the same session
  private conversationsSubject = new BehaviorSubject<SMSConversation[]>([]);
  public conversations$ = this.conversationsSubject.asObservable();

  getCachedConversations(): SMSConversation[] {
    return this.conversationsSubject.getValue();
  }

  constructor() {
    // Seed in-memory BehaviorSubject from localStorage on service init
    const cached = this.readCache();
    if (cached) {
      this.conversationsSubject.next(cached.conversations);
    }
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────

  private readCache(): ConversationsCache | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed: ConversationsCache = JSON.parse(raw);
      if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeCache(conversations: SMSConversation[]): void {
    try {
      const payload: ConversationsCache = { conversations, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage full or unavailable — silently skip
    }
  }

  invalidateCache(): void {
    localStorage.removeItem(CACHE_KEY);
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  getStats(): Observable<ConversationStats> {
    return from(this.fetchStats()).pipe(
      tap(stats => this.unreadCountSubject.next(stats.unread_conversations))
    );
  }

  private async fetchStats(): Promise<ConversationStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run both queries in parallel
    const [convResult, msgResult] = await Promise.all([
      this.supabase.from('sms_conversations').select('status, unread_count'),
      this.supabase
        .from('sms_messages')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'outbound')
        .gte('created_at', today.toISOString())
    ]);

    if (convResult.error) throw convResult.error;

    const stats: ConversationStats = {
      active_conversations: 0,
      escalated_conversations: 0,
      resolved_conversations: 0,
      unread_conversations: 0,
      messages_sent_today: msgResult.count || 0
    };

    for (const conv of (convResult.data || [])) {
      if (conv.status === 'active') stats.active_conversations++;
      else if (conv.status === 'escalated') stats.escalated_conversations++;
      else if (conv.status === 'resolved') stats.resolved_conversations++;
      if (conv.unread_count > 0) stats.unread_conversations++;
    }

    return stats;
  }

  // ─── Conversations list ───────────────────────────────────────────────────

  getConversations(options?: {
    status?: string;
    userType?: string;
    assignedToMe?: boolean;
    adminId?: string;
    limit?: number;
    offset?: number;
  }): Observable<{ conversations: SMSConversation[]; count: number }> {
    return from(this.fetchConversations(options));
  }

  private async fetchConversations(options?: {
    status?: string;
    userType?: string;
    assignedToMe?: boolean;
    adminId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ conversations: SMSConversation[]; count: number }> {
    let query = this.supabase
      .from('sms_conversations')
      .select('*', { count: 'exact' })
      .order('last_message_at', { ascending: false });

    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options?.userType) {
      query = query.eq('user_type', options.userType);
    }
    if (options?.assignedToMe && options?.adminId) {
      query = query.eq('assigned_admin_id', options.adminId);
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Batch-enrich (2 queries total instead of 2N)
    const conversations = await this.enrichConversationsBatch(data || []);

    this.conversationsSubject.next(conversations);
    this.writeCache(conversations);

    return { conversations, count: count || 0 };
  }

  /**
   * Replaces the old N+1 loop with 2 parallel batch queries:
   *  1. Fetch all relevant user names in one .in() call
   *  2. Fetch the most recent messages for all conversation IDs in one query,
   *     then pick the first per conversation in JS
   */
  private async enrichConversationsBatch(conversations: any[]): Promise<SMSConversation[]> {
    if (conversations.length === 0) return [];

    const userIds = [...new Set(conversations.filter(c => c.user_id).map(c => c.user_id as string))];
    const convIds = conversations.map(c => c.id as string);

    const [usersResult, msgsResult] = await Promise.all([
      userIds.length > 0
        ? this.supabase.from('users').select('id, first_name, last_name').in('id', userIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      this.supabase
        .from('sms_messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(convIds.length * 4) // generous cap — picks latest per convo in JS below
    ]);

    const userMap: Record<string, string> = {};
    for (const u of (usersResult.data || [])) {
      userMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
    }

    // First occurrence per conversation_id = most recent message (already sorted DESC)
    const lastMsgMap: Record<string, string> = {};
    for (const msg of (msgsResult.data || [])) {
      if (msg.conversation_id && !lastMsgMap[msg.conversation_id]) {
        lastMsgMap[msg.conversation_id] = msg.content;
      }
    }

    return conversations.map(conv => ({
      ...conv,
      user_name: conv.user_id ? userMap[conv.user_id] : undefined,
      last_message: lastMsgMap[conv.id]
    }));
  }

  // ─── Single conversation ──────────────────────────────────────────────────

  getConversation(conversationId: string): Observable<{
    conversation: SMSConversation;
    messages: SMSMessage[];
  }> {
    return from(this.fetchConversation(conversationId));
  }

  private async fetchConversation(conversationId: string): Promise<{
    conversation: SMSConversation;
    messages: SMSMessage[];
  }> {
    // Fetch conversation, user name, and messages in parallel
    const [convResult, msgsResult] = await Promise.all([
      this.supabase.from('sms_conversations').select('*').eq('id', conversationId).single(),
      this.supabase
        .from('sms_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
    ]);

    if (convResult.error) throw convResult.error;
    if (msgsResult.error) throw msgsResult.error;

    const conv = convResult.data;

    let userName: string | undefined;
    if (conv.user_id) {
      const { data: user } = await this.supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', conv.user_id)
        .single();
      userName = user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : undefined;
    }

    // Mark as read — fire and forget
    this.supabase
      .from('sms_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .then(() => {});

    return {
      conversation: { ...conv, user_name: userName },
      messages: msgsResult.data || []
    };
  }

  // ─── Send reply ───────────────────────────────────────────────────────────

  sendReply(conversationId: string, request: SendReplyRequest, adminId?: string): Observable<{
    status: string;
    message: SMSMessage;
    twilio_sid: string;
  }> {
    return from(this.createReply(conversationId, request, adminId));
  }

  private async createReply(conversationId: string, request: SendReplyRequest, adminId?: string): Promise<{
    status: string;
    message: SMSMessage;
    twilio_sid: string;
  }> {
    // Send via backend — the SMS service's /send/sms endpoint creates the
    // sms_messages record, so we must NOT insert one here (caused duplicates).
    const res = await fetch('/api/send-sms-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: request.phone, content: request.content }),
    });

    const now = new Date().toISOString();

    // Update conversation timestamp + invalidate cache
    await this.supabase
      .from('sms_conversations')
      .update({ last_message_at: now, updated_at: now })
      .eq('id', conversationId);

    this.invalidateCache();

    if (!res.ok) {
      throw new Error('Failed to send message');
    }

    const sent = await res.json();

    // Return an optimistic message for immediate UI display.
    // The real DB record was created by the backend; next refresh will sync.
    const message: SMSMessage = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      direction: 'outbound',
      message_type: 'admin_response',
      notification_type: null,
      content: request.content,
      media_urls: request.media_urls || [],
      twilio_sid: sent.twilio_sid || null,
      twilio_status: null,
      status: 'sent',
      ai_intent: null,
      ai_confidence: null,
      created_at: now,
    };

    return { status: 'sent', message, twilio_sid: sent.twilio_sid || '' };
  }

  // ─── Update / resolve ─────────────────────────────────────────────────────

  updateConversation(conversationId: string, updates: {
    status?: string;
    assigned_admin_id?: string;
  }): Observable<{ status: string; conversation: SMSConversation }> {
    return from(this.doUpdateConversation(conversationId, updates));
  }

  private async doUpdateConversation(conversationId: string, updates: {
    status?: string;
    assigned_admin_id?: string;
  }): Promise<{ status: string; conversation: SMSConversation }> {
    const updateData: any = { updated_at: new Date().toISOString() };

    if (updates.status) {
      updateData.status = updates.status;
      if (updates.status === 'escalated') {
        updateData.escalated_at = new Date().toISOString();
      }
    }
    if (updates.assigned_admin_id) {
      updateData.assigned_admin_id = updates.assigned_admin_id;
    }

    const { data, error } = await this.supabase
      .from('sms_conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) throw error;

    this.invalidateCache();

    return { status: 'success', conversation: data as SMSConversation };
  }

  resolveConversation(conversationId: string): Observable<{ status: string; conversation: SMSConversation }> {
    return this.updateConversation(conversationId, { status: 'resolved' });
  }

  refreshUnreadCount(): void {
    this.getStats().subscribe();
  }
}
