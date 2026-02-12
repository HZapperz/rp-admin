/**
 * Sales Pipeline Service
 *
 * Handles all pipeline operations including lead management, SMS sending, and opt-out management.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, from, forkJoin, of } from 'rxjs';
import { map, tap, catchError, switchMap } from 'rxjs/operators';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import {
  PipelineLead,
  PipelineLeadWithDetails,
  PipelineStage,
  PipelineStats,
  CreatePipelineLeadDto,
  UpdatePipelineLeadDto,
  PipelineFilters,
  SMSTemplate,
  OptOut,
  BulkSMSRequest,
  calculateDaysInStage,
  PIPELINE_STAGES
} from '../models/pipeline.types';
import { SMSConversation, SMSMessage } from '../../../core/services/sms.service';

@Injectable({
  providedIn: 'root'
})
export class SalesPipelineService {
  private supabase: SupabaseClient;
  private smsServiceUrl = environment.smsService.url;

  // Observable for pipeline stats (for sidebar badge)
  private statsSubject = new BehaviorSubject<PipelineStats | null>(null);
  public stats$ = this.statsSubject.asObservable();

  // Observable for real-time lead updates
  private leadsSubject = new BehaviorSubject<PipelineLeadWithDetails[]>([]);
  public leads$ = this.leadsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.serviceRoleKey
    );
  }

  // ==================== LEAD MANAGEMENT ====================

  /**
   * Get all pipeline leads with full details
   */
  getLeads(filters?: PipelineFilters): Observable<PipelineLeadWithDetails[]> {
    return from(this.fetchLeads(filters)).pipe(
      tap(leads => this.leadsSubject.next(leads))
    );
  }

  private async fetchLeads(filters?: PipelineFilters): Promise<PipelineLeadWithDetails[]> {
    let query = this.supabase
      .from('sales_pipeline_leads')
      .select('*')
      .order('priority', { ascending: false })
      .order('stage_changed_at', { ascending: true });

    // Apply filters
    if (filters?.stages && filters.stages.length > 0) {
      query = query.in('pipeline_stage', filters.stages);
    }
    if (filters?.assignedTo) {
      query = query.eq('assigned_admin_id', filters.assignedTo);
    }
    if (filters?.minPriority) {
      query = query.gte('priority', filters.minPriority);
    }

    const { data: leads, error } = await query;
    if (error) throw error;

    // Enrich leads with user details
    const enrichedLeads = await this.enrichLeads(leads || []);

    // Apply client-side filters
    let filtered = enrichedLeads;

    if (filters?.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(lead =>
        lead.user.first_name.toLowerCase().includes(term) ||
        lead.user.last_name.toLowerCase().includes(term) ||
        lead.user.phone?.includes(term) ||
        lead.user.email?.toLowerCase().includes(term)
      );
    }

    if (filters?.hasUnreadSMS) {
      filtered = filtered.filter(lead =>
        lead.conversation && lead.conversation.unread_count > 0
      );
    }

    if (filters?.daysInStageMin) {
      filtered = filtered.filter(lead =>
        lead.days_in_stage >= filters.daysInStageMin!
      );
    }

    return filtered;
  }

  private async enrichLeads(leads: PipelineLead[]): Promise<PipelineLeadWithDetails[]> {
    if (leads.length === 0) return [];

    const userIds = leads.map(l => l.user_id);

    // Batch fetch all related data in parallel
    const [usersResult, petsResult, addressesResult, paymentMethodsResult, bookingsResult, conversationsResult] = await Promise.all([
      this.supabase
        .from('users')
        .select('id, first_name, last_name, email, phone, avatar_url, created_at')
        .in('id', userIds),
      this.supabase
        .from('pets')
        .select('id, name, breed, size_category, user_id')
        .in('user_id', userIds),
      this.supabase
        .from('addresses')
        .select('id, street, city, zip_code, is_default, user_id')
        .in('user_id', userIds),
      this.supabase
        .from('payment_methods')
        .select('id, last4, brand, is_default, user_id')
        .in('user_id', userIds),
      this.supabase
        .from('bookings')
        .select('client_id')
        .in('client_id', userIds),
      this.supabase
        .from('sms_conversations')
        .select('id, status, unread_count, last_message_at, user_id')
        .in('user_id', userIds)
    ]);

    // Create lookup maps for O(1) access
    const usersMap = new Map((usersResult.data || []).map(u => [u.id, u]));
    const petsMap = new Map<string, any[]>();
    const addressesMap = new Map<string, any[]>();
    const paymentMethodsMap = new Map<string, any[]>();
    const bookingsSet = new Set((bookingsResult.data || []).map(b => b.client_id));
    const conversationsMap = new Map((conversationsResult.data || []).map(c => [c.user_id, c]));

    // Group pets, addresses, payment methods by user_id
    for (const pet of petsResult.data || []) {
      if (!petsMap.has(pet.user_id)) petsMap.set(pet.user_id, []);
      petsMap.get(pet.user_id)!.push(pet);
    }
    for (const addr of addressesResult.data || []) {
      if (!addressesMap.has(addr.user_id)) addressesMap.set(addr.user_id, []);
      addressesMap.get(addr.user_id)!.push(addr);
    }
    for (const pm of paymentMethodsResult.data || []) {
      if (!paymentMethodsMap.has(pm.user_id)) paymentMethodsMap.set(pm.user_id, []);
      paymentMethodsMap.get(pm.user_id)!.push(pm);
    }

    // Build enriched leads
    const enriched: PipelineLeadWithDetails[] = [];

    for (const lead of leads) {
      const user = usersMap.get(lead.user_id);
      if (!user) continue;

      const pets = petsMap.get(lead.user_id) || [];
      const addresses = addressesMap.get(lead.user_id) || [];
      const paymentMethods = paymentMethodsMap.get(lead.user_id) || [];
      const conversation = conversationsMap.get(lead.user_id);

      const completion_status = {
        profile_complete: !!(user.first_name && user.last_name && user.phone),
        has_pet: pets.length > 0,
        has_address: addresses.length > 0,
        has_payment_method: paymentMethods.length > 0,
        has_started_booking: bookingsSet.has(lead.user_id)
      };

      enriched.push({
        ...lead,
        user,
        pets,
        addresses,
        payment_methods: paymentMethods,
        completion_status,
        conversation: conversation || undefined,
        days_in_stage: calculateDaysInStage(lead.stage_changed_at)
      });
    }

    return enriched;
  }

  /**
   * Get leads grouped by stage for Kanban view
   */
  getLeadsByStage(filters?: PipelineFilters): Observable<Record<PipelineStage, PipelineLeadWithDetails[]>> {
    return this.getLeads(filters).pipe(
      map(leads => {
        const grouped: Record<PipelineStage, PipelineLeadWithDetails[]> = {
          'NEW': [],
          'TEXTED': [],
          'NO_RESPONSE': [],
          'NEEDS_CALL': [],
          'CALLED': [],
          'CONVERTED': [],
          'LOST': []
        };

        for (const lead of leads) {
          grouped[lead.pipeline_stage].push(lead);
        }

        return grouped;
      })
    );
  }

  /**
   * Get a single lead by ID
   */
  getLead(leadId: string): Observable<PipelineLeadWithDetails | null> {
    return from(this.fetchLead(leadId));
  }

  private async fetchLead(leadId: string): Promise<PipelineLeadWithDetails | null> {
    const { data: lead, error } = await this.supabase
      .from('sales_pipeline_leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (error || !lead) return null;

    const enriched = await this.enrichLeads([lead]);
    return enriched[0] || null;
  }

  /**
   * Get lead by user ID
   */
  getLeadByUserId(userId: string): Observable<PipelineLeadWithDetails | null> {
    return from(this.fetchLeadByUserId(userId));
  }

  private async fetchLeadByUserId(userId: string): Promise<PipelineLeadWithDetails | null> {
    const { data: lead, error } = await this.supabase
      .from('sales_pipeline_leads')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !lead) return null;

    const enriched = await this.enrichLeads([lead]);
    return enriched[0] || null;
  }

  /**
   * Create a new pipeline lead
   */
  createLead(dto: CreatePipelineLeadDto): Observable<PipelineLead> {
    return from(this.doCreateLead(dto));
  }

  private async doCreateLead(dto: CreatePipelineLeadDto): Promise<PipelineLead> {
    const { data, error } = await this.supabase
      .from('sales_pipeline_leads')
      .insert({
        user_id: dto.user_id,
        pipeline_stage: dto.pipeline_stage || 'NEW',
        priority: dto.priority || 5,
        notes: dto.notes,
        assigned_admin_id: dto.assigned_admin_id,
        stage_changed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data as PipelineLead;
  }

  /**
   * Update a pipeline lead
   */
  updateLead(leadId: string, dto: UpdatePipelineLeadDto): Observable<PipelineLead> {
    return from(this.doUpdateLead(leadId, dto));
  }

  private async doUpdateLead(leadId: string, dto: UpdatePipelineLeadDto): Promise<PipelineLead> {
    // If stage is changing, update stage_changed_at
    const updateData: any = { ...dto };
    if (dto.pipeline_stage) {
      updateData.stage_changed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase
      .from('sales_pipeline_leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single();

    if (error) throw error;
    return data as PipelineLead;
  }

  /**
   * Move lead to a different stage
   */
  moveToStage(leadId: string, newStage: PipelineStage, lostReason?: string): Observable<PipelineLead> {
    const updates: UpdatePipelineLeadDto = {
      pipeline_stage: newStage
    };

    if (newStage === 'LOST' && lostReason) {
      updates.lost_reason = lostReason;
    }

    return this.updateLead(leadId, updates);
  }

  /**
   * Delete a pipeline lead
   */
  deleteLead(leadId: string): Observable<boolean> {
    return from(this.doDeleteLead(leadId));
  }

  private async doDeleteLead(leadId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('sales_pipeline_leads')
      .delete()
      .eq('id', leadId);

    if (error) throw error;
    return true;
  }

  // ==================== STATISTICS ====================

  /**
   * Get pipeline statistics
   */
  getStats(): Observable<PipelineStats> {
    return from(this.fetchStats()).pipe(
      tap(stats => this.statsSubject.next(stats))
    );
  }

  private async fetchStats(): Promise<PipelineStats> {
    const { data: leads, error } = await this.supabase
      .from('sales_pipeline_leads')
      .select('pipeline_stage, stage_changed_at');

    if (error) throw error;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats: PipelineStats = {
      total: leads?.length || 0,
      by_stage: {
        'NEW': 0,
        'TEXTED': 0,
        'NO_RESPONSE': 0,
        'NEEDS_CALL': 0,
        'CALLED': 0,
        'CONVERTED': 0,
        'LOST': 0
      },
      needs_attention: 0,
      converted_this_week: 0,
      lost_this_week: 0
    };

    for (const lead of leads || []) {
      stats.by_stage[lead.pipeline_stage as PipelineStage]++;

      const stageChanged = new Date(lead.stage_changed_at);

      // Count needs attention (no response leads older than 3 days)
      if (lead.pipeline_stage === 'NO_RESPONSE' ||
          (lead.pipeline_stage === 'TEXTED' && calculateDaysInStage(lead.stage_changed_at) >= 5)) {
        stats.needs_attention++;
      }

      // Count conversions/losses this week
      if (stageChanged >= oneWeekAgo) {
        if (lead.pipeline_stage === 'CONVERTED') stats.converted_this_week++;
        if (lead.pipeline_stage === 'LOST') stats.lost_this_week++;
      }
    }

    return stats;
  }

  // ==================== SMS OPERATIONS ====================

  /**
   * Send SMS to a lead
   */
  sendSMS(leadId: string, content: string): Observable<any> {
    return this.getLead(leadId).pipe(
      switchMap(lead => {
        if (!lead || !lead.user.phone) {
          throw new Error('Lead not found or has no phone number');
        }

        // Call Python SMS service
        return this.http.post(`${this.smsServiceUrl}/send/sms`, {
          to: lead.user.phone,
          body: content
        }, { headers: this.getSmsServiceHeaders() }).pipe(
          tap(() => {
            // Update last_sms_sent_at and move to TEXTED if NEW
            const updates: UpdatePipelineLeadDto = {
              last_sms_sent_at: new Date().toISOString()
            };
            if (lead.pipeline_stage === 'NEW') {
              updates.pipeline_stage = 'TEXTED';
            }
            this.updateLead(leadId, updates).subscribe();
          })
        );
      })
    );
  }

  /**
   * Send templated SMS to a lead
   */
  sendTemplateSMS(leadId: string, templateId: string, variables?: Record<string, string>): Observable<any> {
    return this.getLead(leadId).pipe(
      switchMap(lead => {
        if (!lead || !lead.user.phone) {
          throw new Error('Lead not found or has no phone number');
        }

        return this.http.post(`${this.smsServiceUrl}/send/template`, {
          to: lead.user.phone,
          template_id: templateId,
          variables: variables || {}
        }, { headers: this.getSmsServiceHeaders() }).pipe(
          tap(() => {
            const updates: UpdatePipelineLeadDto = {
              last_sms_sent_at: new Date().toISOString()
            };
            if (lead.pipeline_stage === 'NEW') {
              updates.pipeline_stage = 'TEXTED';
            }
            this.updateLead(leadId, updates).subscribe();
          })
        );
      })
    );
  }

  /**
   * Send bulk SMS to multiple leads
   */
  sendBulkSMS(request: BulkSMSRequest): Observable<any> {
    return from(this.doBulkSMS(request));
  }

  private async doBulkSMS(request: BulkSMSRequest): Promise<any> {
    const results: any[] = [];

    for (const leadId of request.lead_ids) {
      try {
        const lead = await this.fetchLead(leadId);
        if (!lead || !lead.user.phone) continue;

        let response;
        if (request.template_id) {
          response = await this.http.post(`${this.smsServiceUrl}/send/template`, {
            to: lead.user.phone,
            template_id: request.template_id
          }, { headers: this.getSmsServiceHeaders() }).toPromise();
        } else if (request.custom_message) {
          response = await this.http.post(`${this.smsServiceUrl}/send/sms`, {
            to: lead.user.phone,
            body: request.custom_message
          }, { headers: this.getSmsServiceHeaders() }).toPromise();
        }

        // Update lead
        await this.doUpdateLead(leadId, {
          last_sms_sent_at: new Date().toISOString(),
          pipeline_stage: lead.pipeline_stage === 'NEW' ? 'TEXTED' : lead.pipeline_stage
        });

        results.push({ leadId, success: true, response });
      } catch (error) {
        results.push({ leadId, success: false, error });
      }
    }

    return results;
  }

  /**
   * Get conversation for a lead
   */
  getConversation(userId: string): Observable<{ conversation: SMSConversation | null; messages: SMSMessage[] }> {
    return from(this.fetchConversation(userId));
  }

  private async fetchConversation(userId: string): Promise<{ conversation: SMSConversation | null; messages: SMSMessage[] }> {
    // Get conversation by user_id
    const { data: conversation, error: convError } = await this.supabase
      .from('sms_conversations')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (convError || !conversation) {
      return { conversation: null, messages: [] };
    }

    // Get messages
    const { data: messages, error: msgError } = await this.supabase
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Mark as read
    await this.supabase
      .from('sms_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation.id);

    return {
      conversation,
      messages: messages || []
    };
  }

  /**
   * Send reply to a conversation
   */
  sendReply(conversationId: string, content: string): Observable<any> {
    return from(this.doSendReply(conversationId, content));
  }

  private async doSendReply(conversationId: string, content: string): Promise<any> {
    // Get conversation to find phone number
    const { data: conversation } = await this.supabase
      .from('sms_conversations')
      .select('phone_number, user_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) throw new Error('Conversation not found');

    // Send via SMS service
    const response = await this.http.post(`${this.smsServiceUrl}/send/sms`, {
      to: conversation.phone_number,
      body: content
    }, { headers: this.getSmsServiceHeaders() }).toPromise();

    // Update conversation
    await this.supabase
      .from('sms_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    // Update lead's last_sms_sent_at if lead exists
    if (conversation.user_id) {
      const { data: lead } = await this.supabase
        .from('sales_pipeline_leads')
        .select('id')
        .eq('user_id', conversation.user_id)
        .single();

      if (lead) {
        await this.doUpdateLead(lead.id, {
          last_sms_sent_at: new Date().toISOString()
        });
      }
    }

    return response;
  }

  // ==================== SMS TEMPLATES ====================

  /**
   * Get available SMS templates
   */
  getTemplates(): Observable<SMSTemplate[]> {
    // For now, return hardcoded templates. Can be moved to database later.
    const templates: SMSTemplate[] = [
      {
        id: 'welcome',
        name: 'Welcome Message',
        content: 'Hi {{first_name}}! Welcome to Royal Pawz mobile grooming. Ready to pamper your fur baby? Book your first appointment at royalpawzusa.com or reply with questions!',
        category: 'welcome',
        variables: ['first_name']
      },
      {
        id: 'follow_up_1',
        name: 'First Follow-up',
        content: 'Hi {{first_name}}! Just checking in - noticed you started signing up for Royal Pawz. Need any help completing your profile? We\'d love to get {{pet_name}} looking fabulous!',
        category: 'follow_up',
        variables: ['first_name', 'pet_name']
      },
      {
        id: 'follow_up_2',
        name: 'Second Follow-up',
        content: 'Hey {{first_name}}! Your pup deserves the royal treatment. Book now and get 15% off your first groom with code NEWPUP15. Questions? Just reply!',
        category: 'follow_up',
        variables: ['first_name']
      },
      {
        id: 'no_response',
        name: 'No Response Follow-up',
        content: 'Hi {{first_name}}, we haven\'t heard from you! Still interested in mobile grooming for {{pet_name}}? Reply YES and we\'ll help you get started.',
        category: 'follow_up',
        variables: ['first_name', 'pet_name']
      },
      {
        id: 'incomplete_profile',
        name: 'Incomplete Profile Reminder',
        content: 'Hi {{first_name}}! Your Royal Pawz profile is almost complete. Just add {{missing_step}} to book your first appointment. Need help? Reply here!',
        category: 'reminder',
        variables: ['first_name', 'missing_step']
      },
      {
        id: 'abandoned_booking',
        name: 'Abandoned Booking',
        content: 'Hi {{first_name}}! Looks like you didn\'t finish booking. Your slot is still available - complete your booking now before it fills up! royalpawzusa.com',
        category: 'reminder',
        variables: ['first_name']
      },
      {
        id: 'promo_first_time',
        name: 'First-Time Promo',
        content: '{{first_name}}, exclusive offer just for you! Get 20% off your first Royal Pawz groom. Use code FIRST20 at checkout. Book now: royalpawzusa.com',
        category: 'promo',
        variables: ['first_name']
      },
      {
        id: 'seasonal_promo',
        name: 'Seasonal Promo',
        content: 'Hi {{first_name}}! Spring grooming special: Book this week and get a free de-shedding treatment for {{pet_name}}! Reply BOOK or visit royalpawzusa.com',
        category: 'promo',
        variables: ['first_name', 'pet_name']
      }
    ];

    return of(templates);
  }

  // ==================== OPT-OUT MANAGEMENT ====================

  /**
   * Get all opted-out numbers
   */
  getOptOuts(): Observable<OptOut[]> {
    return from(this.fetchOptOuts());
  }

  private async fetchOptOuts(): Promise<OptOut[]> {
    const { data, error } = await this.supabase
      .from('sms_opt_outs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with user names
    const enriched: OptOut[] = [];
    for (const optOut of data || []) {
      let userName: string | null = null;

      // Try to find user by phone
      const { data: user } = await this.supabase
        .from('users')
        .select('first_name, last_name')
        .eq('phone', optOut.phone_number)
        .single();

      if (user) {
        userName = `${user.first_name} ${user.last_name}`;
      }

      enriched.push({
        id: optOut.id,
        phone_number: optOut.phone_number,
        opted_out_at: optOut.created_at,
        reason: optOut.reason,
        user_name: userName
      });
    }

    return enriched;
  }

  /**
   * Restore opt-in for a phone number
   */
  restoreOptIn(phoneNumber: string): Observable<boolean> {
    return this.http.post<any>(
      `${this.smsServiceUrl}/opt-outs/${encodeURIComponent(phoneNumber)}/restore`,
      {},
      { headers: this.getSmsServiceHeaders() }
    ).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  // ==================== AUTOMATION ====================

  /**
   * Run automation check (typically called by a cron job)
   * - Move leads to NO_RESPONSE after 5 days with no reply
   */
  runAutomationCheck(): Observable<any> {
    return from(this.doAutomationCheck());
  }

  private async doAutomationCheck(): Promise<any> {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    // Find TEXTED leads with no reply for 5+ days
    const { data: staleLeads } = await this.supabase
      .from('sales_pipeline_leads')
      .select('id, user_id')
      .eq('pipeline_stage', 'TEXTED')
      .lt('stage_changed_at', fiveDaysAgo.toISOString())
      .is('last_sms_replied_at', null);

    const results: any[] = [];

    for (const lead of staleLeads || []) {
      try {
        await this.doUpdateLead(lead.id, { pipeline_stage: 'NO_RESPONSE' });

        // Log automation
        await this.supabase
          .from('pipeline_automation_logs')
          .insert({
            lead_id: lead.id,
            automation_type: 'auto_no_response',
            status: 'success',
            metadata: { reason: '5 days no reply after texted' }
          });

        results.push({ leadId: lead.id, success: true });
      } catch (error) {
        // Log failure
        await this.supabase
          .from('pipeline_automation_logs')
          .insert({
            lead_id: lead.id,
            automation_type: 'auto_no_response',
            status: 'failed',
            error_message: String(error)
          });

        results.push({ leadId: lead.id, success: false, error });
      }
    }

    return results;
  }

  // ==================== DATA MIGRATION ====================

  /**
   * Populate pipeline from existing warm leads (one-time migration)
   */
  migrateWarmLeads(): Observable<any> {
    return from(this.doMigrateWarmLeads());
  }

  private async doMigrateWarmLeads(): Promise<any> {
    // Get all clients who haven't completed a booking
    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, created_at')
      .eq('role', 'CLIENT');

    if (usersError) throw usersError;

    const results: any[] = [];

    for (const user of users || []) {
      // Check if user has any completed bookings
      const { count: completedBookings } = await this.supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('status', 'completed');

      if ((completedBookings || 0) > 0) continue;

      // Check if already in pipeline
      const { data: existing } = await this.supabase
        .from('sales_pipeline_leads')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existing) continue;

      // Check if user has been texted (has conversation)
      const { data: conversation } = await this.supabase
        .from('sms_conversations')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const stage: PipelineStage = conversation ? 'TEXTED' : 'NEW';

      try {
        await this.doCreateLead({
          user_id: user.id,
          pipeline_stage: stage
        });
        results.push({ userId: user.id, success: true, stage });
      } catch (error) {
        results.push({ userId: user.id, success: false, error });
      }
    }

    return results;
  }

  // ==================== HELPERS ====================

  private getSmsServiceHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'X-API-Key': environment.smsService.apiKey
    });
  }

  /**
   * Format phone number for display
   */
  formatPhone(phone: string | null): string {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  }

  /**
   * Get template with variables replaced
   */
  interpolateTemplate(template: SMSTemplate, lead: PipelineLeadWithDetails): string {
    let content = template.content;

    const variables: Record<string, string> = {
      first_name: lead.user.first_name,
      last_name: lead.user.last_name,
      pet_name: lead.pets[0]?.name || 'your pet',
      missing_step: this.getMissingStep(lead.completion_status)
    };

    for (const [key, value] of Object.entries(variables)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return content;
  }

  private getMissingStep(status: PipelineLeadWithDetails['completion_status']): string {
    if (!status.has_pet) return 'your pet info';
    if (!status.has_address) return 'your address';
    if (!status.has_payment_method) return 'a payment method';
    return 'your profile';
  }
}
