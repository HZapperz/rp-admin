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

@Injectable({
  providedIn: 'root'
})
export class SMSService {
  private supabaseService = inject(SupabaseService);
  private get supabase() { return this.supabaseService.client; }

  // Observable for unread count (for sidebar badge)
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  /**
   * Get conversation statistics
   */
  getStats(): Observable<ConversationStats> {
    return from(this.fetchStats()).pipe(
      tap(stats => this.unreadCountSubject.next(stats.unread_conversations))
    );
  }

  private async fetchStats(): Promise<ConversationStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get conversation counts by status
    const { data: conversations, error: convError } = await this.supabase
      .from('sms_conversations')
      .select('status, unread_count');

    if (convError) throw convError;

    // Get messages sent today
    const { count: messagesSentToday, error: msgError } = await this.supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .gte('created_at', today.toISOString());

    if (msgError) throw msgError;

    const stats: ConversationStats = {
      active_conversations: 0,
      escalated_conversations: 0,
      resolved_conversations: 0,
      unread_conversations: 0,
      messages_sent_today: messagesSentToday || 0
    };

    if (conversations) {
      for (const conv of conversations) {
        if (conv.status === 'active') stats.active_conversations++;
        else if (conv.status === 'escalated') stats.escalated_conversations++;
        else if (conv.status === 'resolved') stats.resolved_conversations++;

        if (conv.unread_count > 0) stats.unread_conversations++;
      }
    }

    return stats;
  }

  /**
   * List conversations with optional filters
   */
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

    // Fetch user names and last messages
    const conversations = await this.enrichConversations(data || []);

    return {
      conversations,
      count: count || 0
    };
  }

  private async enrichConversations(conversations: any[]): Promise<SMSConversation[]> {
    const enriched: SMSConversation[] = [];

    for (const conv of conversations) {
      // Get user name if user_id exists
      let userName: string | undefined;
      if (conv.user_id) {
        const { data: user } = await this.supabase
          .from('users')
          .select('first_name, last_name')
          .eq('id', conv.user_id)
          .single();
        userName = user ? `${user.first_name} ${user.last_name}`.trim() : undefined;
      }

      // Get last message
      const { data: lastMessage } = await this.supabase
        .from('sms_messages')
        .select('content')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      enriched.push({
        ...conv,
        user_name: userName,
        last_message: lastMessage?.content
      });
    }

    return enriched;
  }

  /**
   * Get a single conversation with messages
   */
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
    // Get conversation
    const { data: conv, error: convError } = await this.supabase
      .from('sms_conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError) throw convError;

    // Get user name
    let userName: string | undefined;
    if (conv.user_id) {
      const { data: user } = await this.supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', conv.user_id)
        .single();
      userName = user ? `${user.first_name} ${user.last_name}`.trim() : undefined;
    }

    // Get messages
    const { data: messages, error: msgError } = await this.supabase
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Mark as read (reset unread count)
    await this.supabase
      .from('sms_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);

    return {
      conversation: {
        ...conv,
        user_name: userName
      },
      messages: messages || []
    };
  }

  /**
   * Send a reply in a conversation — inserts DB record then calls Python SMS service
   */
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
    // Create message record
    const messageData = {
      conversation_id: conversationId,
      direction: 'outbound',
      message_type: 'admin_response',
      content: request.content,
      media_urls: request.media_urls || [],
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const { data: message, error } = await this.supabase
      .from('sms_messages')
      .insert(messageData)
      .select()
      .single();

    if (error) throw error;

    // Update conversation last_message_at
    await this.supabase
      .from('sms_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    // Send via Vercel Edge Function (keeps API key server-side)
    const res = await fetch('/api/send-sms-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: request.phone, content: request.content }),
    });

    if (res.ok) {
      const sent = await res.json();
      await this.supabase
        .from('sms_messages')
        .update({ twilio_sid: sent.twilio_sid, status: 'sent' })
        .eq('id', message.id);
      message.twilio_sid = sent.twilio_sid;
      message.status = 'sent';
      return {
        status: 'sent',
        message: message as SMSMessage,
        twilio_sid: sent.twilio_sid
      };
    }

    return {
      status: 'queued',
      message: message as SMSMessage,
      twilio_sid: ''
    };
  }

  /**
   * Update conversation status or assignment
   */
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
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

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

    return {
      status: 'success',
      conversation: data as SMSConversation
    };
  }

  /**
   * Resolve a conversation
   */
  resolveConversation(conversationId: string): Observable<{ status: string; conversation: SMSConversation }> {
    return this.updateConversation(conversationId, { status: 'resolved' });
  }

  /**
   * Refresh unread count
   */
  refreshUnreadCount(): void {
    this.getStats().subscribe();
  }
}
