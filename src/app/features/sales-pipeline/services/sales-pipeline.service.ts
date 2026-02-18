/**
 * Sales Pipeline Service
 *
 * Handles all pipeline operations including lead management, SMS sending,
 * activity logging, smart prioritization, nudges, and automation.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, from, of } from 'rxjs';
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
  ContactActivity,
  ContactActivityType,
  ContactOutcome,
  SuggestedAction,
  PipelineNudge,
  PipelineAutomation,
  calculateDaysInStage,
  getCompletionCount,
  getCompletionPercentage,
  PIPELINE_STAGES,
  PRIORITY_THRESHOLDS
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

  getLeads(filters?: PipelineFilters): Observable<PipelineLeadWithDetails[]> {
    return from(this.fetchLeads(filters)).pipe(
      tap(leads => this.leadsSubject.next(leads))
    );
  }

  private async fetchLeads(filters?: PipelineFilters): Promise<PipelineLeadWithDetails[]> {
    let query = this.supabase
      .from('sales_pipeline_leads')
      .select('*')
      .order('priority_score', { ascending: false })
      .order('stage_changed_at', { ascending: true });

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

    const enrichedLeads = await this.enrichLeads(leads || []);

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

    if (filters?.priorityLevel) {
      filtered = filtered.filter(lead => {
        const score = lead.priority_score;
        if (filters.priorityLevel === 'high') return score >= PRIORITY_THRESHOLDS.high;
        if (filters.priorityLevel === 'medium') return score >= PRIORITY_THRESHOLDS.medium && score < PRIORITY_THRESHOLDS.high;
        return score < PRIORITY_THRESHOLDS.medium;
      });
    }

    return filtered;
  }

  private async enrichLeads(leads: PipelineLead[]): Promise<PipelineLeadWithDetails[]> {
    if (leads.length === 0) return [];

    const userIds = leads.map(l => l.user_id);
    const leadIds = leads.map(l => l.id);

    // Batch fetch all related data in parallel
    const [usersResult, petsResult, addressesResult, paymentMethodsResult, bookingsResult, conversationsResult, activitiesResult] = await Promise.all([
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
        .in('user_id', userIds),
      this.supabase
        .from('contact_activities')
        .select('*')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(500)
    ]);

    // Create lookup maps
    const usersMap = new Map((usersResult.data || []).map(u => [u.id, u]));
    const petsMap = new Map<string, any[]>();
    const addressesMap = new Map<string, any[]>();
    const paymentMethodsMap = new Map<string, any[]>();
    const bookingsSet = new Set((bookingsResult.data || []).map(b => b.client_id));
    const conversationsMap = new Map((conversationsResult.data || []).map(c => [c.user_id, c]));
    const activitiesMap = new Map<string, ContactActivity[]>();

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
    for (const activity of activitiesResult.data || []) {
      if (!activitiesMap.has(activity.lead_id)) activitiesMap.set(activity.lead_id, []);
      activitiesMap.get(activity.lead_id)!.push(activity);
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
      const activities = activitiesMap.get(lead.id) || [];

      const completion_status = {
        profile_complete: !!(user.first_name && user.last_name && user.phone),
        has_pet: pets.length > 0,
        has_address: addresses.length > 0,
        has_payment_method: paymentMethods.length > 0,
        has_started_booking: bookingsSet.has(lead.user_id)
      };

      const daysInStage = calculateDaysInStage(lead.stage_changed_at);

      // Compute priority score
      const priorityScore = this.calculatePriorityScore(lead, user, completion_status, conversation, activities);

      // Compute suggested action
      const suggestedAction = this.computeSuggestedAction(lead, completion_status, conversation, daysInStage);

      enriched.push({
        ...lead,
        priority_score: priorityScore,
        user,
        pets,
        addresses,
        payment_methods: paymentMethods,
        completion_status,
        conversation: conversation || undefined,
        activities,
        computed_suggested_action: suggestedAction,
        days_in_stage: daysInStage
      });
    }

    // Sort by priority_score descending
    enriched.sort((a, b) => b.priority_score - a.priority_score);

    return enriched;
  }

  // ==================== SMART PRIORITY SCORING ====================

  private calculatePriorityScore(
    lead: PipelineLead,
    user: any,
    completionStatus: PipelineLeadWithDetails['completion_status'],
    conversation: any,
    activities: ContactActivity[]
  ): number {
    let score = 0;

    // Profile completeness: 0-25 points (5 per step)
    const completionChecks = [
      completionStatus.profile_complete,
      completionStatus.has_pet,
      completionStatus.has_address,
      completionStatus.has_payment_method,
      completionStatus.has_started_booking
    ];
    score += completionChecks.filter(Boolean).length * 5;

    // Signup recency: 0-20 points
    const daysSinceSignup = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceSignup < 3) score += 20;
    else if (daysSinceSignup < 7) score += 15;
    else if (daysSinceSignup < 14) score += 10;
    else if (daysSinceSignup < 30) score += 5;

    // Engagement: 0-20 points
    if (lead.last_sms_replied_at) score += 10;
    if (conversation && conversation.unread_count > 0) score += 10;
    else if (conversation) score += 5;

    // Stage staleness: 0-15 points (fresher = higher score)
    const daysInStage = calculateDaysInStage(lead.stage_changed_at);
    if (daysInStage < 2) score += 15;
    else if (daysInStage < 5) score += 10;
    else if (daysInStage < 10) score += 5;

    // Stage bonus: +5 for BOOKED (close to converting)
    if (lead.pipeline_stage === 'BOOKED') score += 5;

    // Geo boost: +10
    if (lead.geo_boost) score += 10;

    // Historical similarity: +10 if completion >= 80%
    if (getCompletionPercentage(completionStatus) >= 80) score += 10;

    return Math.min(score, 100);
  }

  // ==================== SUGGESTED ACTIONS ====================

  private computeSuggestedAction(
    lead: PipelineLead,
    completionStatus: PipelineLeadWithDetails['completion_status'],
    conversation: any,
    daysInStage: number
  ): SuggestedAction | null {
    const completionPct = getCompletionPercentage(completionStatus);

    // High completion leads — push to convert regardless of stage
    if (completionPct >= 80 && !['CONVERTED', 'LOST', 'DORMANT', 'BOOKED'].includes(lead.pipeline_stage)) {
      return {
        action: 'Ready to convert — offer to book',
        reason: 'Profile is 80%+ complete',
        icon: 'star',
        priority: 'high'
      };
    }

    switch (lead.pipeline_stage) {
      case 'NEW':
        if (!lead.last_sms_sent_at) {
          return { action: 'Send welcome SMS', reason: 'New lead, no contact yet', icon: 'sms', priority: 'high' };
        }
        return { action: 'Follow up or move to Texted', reason: 'SMS sent but still in New', icon: 'forward', priority: 'medium' };

      case 'TEXTED':
        if (daysInStage >= 5) {
          return { action: 'Move to No Response or call', reason: `${daysInStage} days with no reply`, icon: 'phone', priority: 'high' };
        }
        if (daysInStage >= 3) {
          return { action: 'Send follow-up SMS', reason: `${daysInStage} days since first text`, icon: 'sms', priority: 'medium' };
        }
        return { action: 'Wait for reply', reason: 'Recently texted', icon: 'hourglass_empty', priority: 'low' };

      case 'NO_RESPONSE':
        return { action: 'Call this lead', reason: 'SMS didn\'t work, try calling', icon: 'phone', priority: 'high' };

      case 'NEEDS_CALL':
        return { action: 'Make the call', reason: 'Flagged for phone follow-up', icon: 'phone_in_talk', priority: 'high' };

      case 'CALLED':
        if (lead.last_call_at) {
          const daysSinceCall = Math.floor(
            (Date.now() - new Date(lead.last_call_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceCall >= 3) {
            return { action: 'Follow up again', reason: `${daysSinceCall} days since last call`, icon: 'phone_callback', priority: 'medium' };
          }
        }
        return { action: 'Check if ready to book', reason: 'Call made, await response', icon: 'event_available', priority: 'low' };

      case 'BOOKED':
        if (!completionStatus.has_payment_method) {
          return { action: 'Remind to add payment method', reason: 'Booking created but no payment on file', icon: 'credit_card', priority: 'high' };
        }
        return { action: 'Confirm booking details', reason: 'Has a pending/confirmed booking', icon: 'event_available', priority: 'medium' };

      case 'DORMANT':
        return { action: 'Review — reactivate or archive', reason: 'No activity for 30+ days', icon: 'restore', priority: 'low' };

      default:
        return null;
    }
  }

  // ==================== NUDGES ====================

  getNudges(leads: PipelineLeadWithDetails[]): PipelineNudge[] {
    const nudges: PipelineNudge[] = [];

    // New leads not contacted
    const uncontactedNew = leads.filter(l => l.pipeline_stage === 'NEW' && !l.last_sms_sent_at);
    if (uncontactedNew.length > 0) {
      nudges.push({
        message: `${uncontactedNew.length} new lead${uncontactedNew.length > 1 ? 's' : ''} haven't been contacted`,
        count: uncontactedNew.length,
        stage: 'NEW',
        icon: 'notification_important',
        severity: 'warning'
      });
    }

    // No Response leads stuck for 7+ days
    const staleNoResponse = leads.filter(l => l.pipeline_stage === 'NO_RESPONSE' && l.days_in_stage >= 7);
    if (staleNoResponse.length > 0) {
      nudges.push({
        message: `${staleNoResponse.length} lead${staleNoResponse.length > 1 ? 's' : ''} in No Response for 7+ days`,
        count: staleNoResponse.length,
        stage: 'NO_RESPONSE',
        icon: 'warning',
        severity: 'error'
      });
    }

    // Booked leads stuck for 5+ days
    const staleBooked = leads.filter(l => l.pipeline_stage === 'BOOKED' && l.days_in_stage >= 5);
    if (staleBooked.length > 0) {
      nudges.push({
        message: `${staleBooked.length} booked lead${staleBooked.length > 1 ? 's' : ''} pending for 5+ days — confirm or follow up`,
        count: staleBooked.length,
        stage: 'BOOKED',
        icon: 'event_busy',
        severity: 'warning'
      });
    }

    // Dormant leads
    const dormant = leads.filter(l => l.pipeline_stage === 'DORMANT');
    if (dormant.length > 0) {
      nudges.push({
        message: `${dormant.length} dormant lead${dormant.length > 1 ? 's' : ''} — review or archive`,
        count: dormant.length,
        stage: 'DORMANT',
        icon: 'hotel',
        severity: 'info'
      });
    }

    // Unread SMS replies
    const unreadReplies = leads.filter(l => l.conversation && l.conversation.unread_count > 0);
    if (unreadReplies.length > 0) {
      nudges.push({
        message: `${unreadReplies.length} unread SMS repl${unreadReplies.length > 1 ? 'ies' : 'y'}`,
        count: unreadReplies.length,
        stage: null,
        icon: 'mark_chat_unread',
        severity: 'warning'
      });
    }

    return nudges;
  }

  // ==================== ACTIVITY LOGGING ====================

  logActivity(
    leadId: string,
    userId: string | null,
    activityType: ContactActivityType,
    outcome?: ContactOutcome | null,
    notes?: string,
    metadata?: Record<string, any>
  ): Observable<ContactActivity> {
    return from(this.doLogActivity(leadId, userId, activityType, outcome, notes, metadata));
  }

  private async doLogActivity(
    leadId: string,
    userId: string | null,
    activityType: ContactActivityType,
    outcome?: ContactOutcome | null,
    notes?: string,
    metadata?: Record<string, any>
  ): Promise<ContactActivity> {
    const { data, error } = await this.supabase
      .from('contact_activities')
      .insert({
        lead_id: leadId,
        user_id: userId,
        activity_type: activityType,
        outcome: outcome || null,
        notes: notes || null,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) throw error;

    // Update last_activity_at on the lead
    await this.supabase
      .from('sales_pipeline_leads')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', leadId);

    return data;
  }

  getActivities(leadId: string): Observable<ContactActivity[]> {
    return from(this.fetchActivities(leadId));
  }

  private async fetchActivities(leadId: string): Promise<ContactActivity[]> {
    const { data, error } = await this.supabase
      .from('contact_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  }

  // ==================== KANBAN VIEW ====================

  getLeadsByStage(filters?: PipelineFilters): Observable<Record<PipelineStage, PipelineLeadWithDetails[]>> {
    return this.getLeads(filters).pipe(
      map(leads => {
        const grouped: Record<PipelineStage, PipelineLeadWithDetails[]> = {
          'NEW': [],
          'TEXTED': [],
          'NO_RESPONSE': [],
          'NEEDS_CALL': [],
          'CALLED': [],
          'BOOKED': [],
          'CONVERTED': [],
          'LOST': [],
          'DORMANT': []
        };

        for (const lead of leads) {
          if (grouped[lead.pipeline_stage]) {
            grouped[lead.pipeline_stage].push(lead);
          }
        }

        return grouped;
      })
    );
  }

  // ==================== SINGLE LEAD ====================

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

  // ==================== LEAD CRUD ====================

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
        geo_boost: dto.geo_boost || false,
        stage_changed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data as PipelineLead;
  }

  updateLead(leadId: string, dto: UpdatePipelineLeadDto): Observable<PipelineLead> {
    return from(this.doUpdateLead(leadId, dto));
  }

  private async doUpdateLead(leadId: string, dto: UpdatePipelineLeadDto): Promise<PipelineLead> {
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

  moveToStage(leadId: string, newStage: PipelineStage, lostReason?: string): Observable<PipelineLead> {
    const updates: UpdatePipelineLeadDto = {
      pipeline_stage: newStage,
      last_activity_at: new Date().toISOString()
    };

    if (newStage === 'LOST' && lostReason) {
      updates.lost_reason = lostReason;
    }

    // Log the stage change as an activity
    this.supabase
      .from('sales_pipeline_leads')
      .select('user_id, pipeline_stage')
      .eq('id', leadId)
      .single()
      .then(({ data }) => {
        if (data) {
          this.doLogActivity(leadId, data.user_id, 'STAGE_CHANGE', null,
            `Moved from ${data.pipeline_stage} to ${newStage}`,
            { from_stage: data.pipeline_stage, to_stage: newStage }
          );
        }
      });

    return this.updateLead(leadId, updates);
  }

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

  getStats(): Observable<PipelineStats> {
    return from(this.fetchStats()).pipe(
      tap(stats => this.statsSubject.next(stats))
    );
  }

  private async fetchStats(): Promise<PipelineStats> {
    const { data: leads, error } = await this.supabase
      .from('sales_pipeline_leads')
      .select('pipeline_stage, stage_changed_at, converted_booking_id');

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
        'BOOKED': 0,
        'CONVERTED': 0,
        'LOST': 0,
        'DORMANT': 0
      },
      needs_attention: 0,
      converted_this_week: 0,
      lost_this_week: 0,
      dormant_count: 0,
      avg_days_to_convert: 0,
      nudges: []
    };

    let convertedDaysTotal = 0;
    let convertedCount = 0;

    for (const lead of leads || []) {
      const stage = lead.pipeline_stage as PipelineStage;
      if (stats.by_stage[stage] !== undefined) {
        stats.by_stage[stage]++;
      }

      const stageChanged = new Date(lead.stage_changed_at);
      const daysInStage = calculateDaysInStage(lead.stage_changed_at);

      // Needs attention
      if (stage === 'NO_RESPONSE' ||
          (stage === 'TEXTED' && daysInStage >= 5) ||
          (stage === 'BOOKED' && daysInStage >= 7)) {
        stats.needs_attention++;
      }

      // Conversions/losses this week
      if (stageChanged >= oneWeekAgo) {
        if (stage === 'CONVERTED') stats.converted_this_week++;
        if (stage === 'LOST') stats.lost_this_week++;
      }

      // Track conversion time
      if (stage === 'CONVERTED' && lead.converted_booking_id) {
        convertedDaysTotal += daysInStage;
        convertedCount++;
      }
    }

    stats.dormant_count = stats.by_stage['DORMANT'];
    stats.avg_days_to_convert = convertedCount > 0 ? Math.round(convertedDaysTotal / convertedCount) : 0;

    return stats;
  }

  // ==================== SMS OPERATIONS ====================

  sendSMS(leadId: string, content: string): Observable<any> {
    return this.getLead(leadId).pipe(
      switchMap(lead => {
        if (!lead || !lead.user.phone) {
          throw new Error('Lead not found or has no phone number');
        }

        return this.http.post(`${this.smsServiceUrl}/send/sms`, {
          to: lead.user.phone,
          body: content
        }, { headers: this.getSmsServiceHeaders() }).pipe(
          tap(() => {
            // Update lead and log activity
            const updates: UpdatePipelineLeadDto = {
              last_sms_sent_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString()
            };
            if (lead.pipeline_stage === 'NEW') {
              updates.pipeline_stage = 'TEXTED';
            }
            this.updateLead(leadId, updates).subscribe();

            // Log activity
            this.doLogActivity(leadId, lead.user_id, 'SMS_SENT', null, content, { message_length: content.length });
          })
        );
      })
    );
  }

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
              last_sms_sent_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString()
            };
            if (lead.pipeline_stage === 'NEW') {
              updates.pipeline_stage = 'TEXTED';
            }
            this.updateLead(leadId, updates).subscribe();

            this.doLogActivity(leadId, lead.user_id, 'SMS_SENT', null,
              `Template: ${templateId}`, { template_id: templateId });
          })
        );
      })
    );
  }

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

        await this.doUpdateLead(leadId, {
          last_sms_sent_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
          pipeline_stage: lead.pipeline_stage === 'NEW' ? 'TEXTED' : lead.pipeline_stage
        });

        await this.doLogActivity(leadId, lead.user_id, 'SMS_SENT', null, 'Bulk SMS', { bulk: true });

        results.push({ leadId, success: true, response });
      } catch (error) {
        results.push({ leadId, success: false, error });
      }
    }

    return results;
  }

  // ==================== CONVERSATIONS ====================

  getConversation(userId: string): Observable<{ conversation: SMSConversation | null; messages: SMSMessage[] }> {
    return from(this.fetchConversation(userId));
  }

  private async fetchConversation(userId: string): Promise<{ conversation: SMSConversation | null; messages: SMSMessage[] }> {
    const { data: conversation, error: convError } = await this.supabase
      .from('sms_conversations')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (convError || !conversation) {
      return { conversation: null, messages: [] };
    }

    const { data: messages, error: msgError } = await this.supabase
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    await this.supabase
      .from('sms_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation.id);

    return {
      conversation,
      messages: messages || []
    };
  }

  sendReply(conversationId: string, content: string): Observable<any> {
    return from(this.doSendReply(conversationId, content));
  }

  private async doSendReply(conversationId: string, content: string): Promise<any> {
    const { data: conversation } = await this.supabase
      .from('sms_conversations')
      .select('phone_number, user_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) throw new Error('Conversation not found');

    const response = await this.http.post(`${this.smsServiceUrl}/send/sms`, {
      to: conversation.phone_number,
      body: content
    }, { headers: this.getSmsServiceHeaders() }).toPromise();

    await this.supabase
      .from('sms_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    // Update lead and log activity
    if (conversation.user_id) {
      const { data: lead } = await this.supabase
        .from('sales_pipeline_leads')
        .select('id')
        .eq('user_id', conversation.user_id)
        .single();

      if (lead) {
        await this.doUpdateLead(lead.id, {
          last_sms_sent_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString()
        });
        await this.doLogActivity(lead.id, conversation.user_id, 'SMS_SENT', null, content);
      }
    }

    return response;
  }

  // ==================== SMS TEMPLATES (DB-BACKED) ====================

  getTemplates(): Observable<SMSTemplate[]> {
    return from(this.fetchTemplates());
  }

  private async fetchTemplates(): Promise<SMSTemplate[]> {
    const { data, error } = await this.supabase
      .from('sms_templates')
      .select('id, name, content, category, variables')
      .eq('user_type', 'pipeline')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map(t => ({
      id: t.id,
      name: t.name.replace('pipeline_', '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      content: t.content,
      category: t.category,
      variables: t.variables || []
    }));
  }

  // ==================== OPT-OUT MANAGEMENT ====================

  getOptOuts(): Observable<OptOut[]> {
    return from(this.fetchOptOuts());
  }

  private async fetchOptOuts(): Promise<OptOut[]> {
    const { data, error } = await this.supabase
      .from('sms_opt_outs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched: OptOut[] = [];
    for (const optOut of data || []) {
      let userName: string | null = null;

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

  // ==================== AUTOMATION ENGINE ====================

  runAutomationCheck(): Observable<any> {
    return from(this.doAutomationCheck());
  }

  private async doAutomationCheck(): Promise<any> {
    // Fetch active automations from DB
    const { data: automations } = await this.supabase
      .from('pipeline_automations')
      .select('*')
      .eq('is_active', true);

    const results: any[] = [];

    for (const automation of automations || []) {
      try {
        switch (automation.trigger_type) {
          case 'TIME_IN_STAGE': {
            const { stage, days } = automation.trigger_config;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);

            const { data: staleLeads } = await this.supabase
              .from('sales_pipeline_leads')
              .select('id, user_id')
              .eq('pipeline_stage', stage)
              .lt('stage_changed_at', cutoff.toISOString())
              .is('last_sms_replied_at', null);

            for (const lead of staleLeads || []) {
              const toStage = automation.action_config.to_stage;
              await this.doUpdateLead(lead.id, { pipeline_stage: toStage, last_activity_at: new Date().toISOString() });
              await this.doLogActivity(lead.id, lead.user_id, 'AUTO_ACTION', null,
                `Auto: ${automation.name} — moved to ${toStage}`,
                { automation_id: automation.id, from_stage: stage, to_stage: toStage }
              );
              results.push({ leadId: lead.id, automation: automation.name, success: true });
            }
            break;
          }

          case 'NO_ACTIVITY': {
            const { days } = automation.trigger_config;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);

            const { data: inactiveLeads } = await this.supabase
              .from('sales_pipeline_leads')
              .select('id, user_id, pipeline_stage')
              .not('pipeline_stage', 'in', '("CONVERTED","LOST","DORMANT")')
              .or(`last_activity_at.is.null,last_activity_at.lt.${cutoff.toISOString()}`);

            for (const lead of inactiveLeads || []) {
              const toStage = automation.action_config.to_stage;
              await this.doUpdateLead(lead.id, { pipeline_stage: toStage, last_activity_at: new Date().toISOString() });
              await this.doLogActivity(lead.id, lead.user_id, 'AUTO_ACTION', null,
                `Auto: ${automation.name} — moved to ${toStage}`,
                { automation_id: automation.id, from_stage: lead.pipeline_stage, to_stage: toStage }
              );
              results.push({ leadId: lead.id, automation: automation.name, success: true });
            }
            break;
          }
        }
      } catch (error) {
        await this.supabase
          .from('pipeline_automation_logs')
          .insert({
            lead_id: null,
            automation_type: automation.name,
            status: 'failed',
            error_message: String(error),
            metadata: { automation_id: automation.id }
          });
        results.push({ automation: automation.name, success: false, error });
      }
    }

    return results;
  }

  // ==================== CALL LOGGING ====================

  logCall(leadId: string, userId: string, outcome: ContactOutcome, notes?: string): Observable<ContactActivity> {
    return from(this.doLogCall(leadId, userId, outcome, notes));
  }

  private async doLogCall(leadId: string, userId: string, outcome: ContactOutcome, notes?: string): Promise<ContactActivity> {
    // Log the activity
    const activity = await this.doLogActivity(leadId, userId, 'CALLED', outcome, notes, { outcome });

    // Update the lead
    const updates: UpdatePipelineLeadDto = {
      last_call_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString()
    };

    // Auto-advance stage based on outcome
    const { data: lead } = await this.supabase
      .from('sales_pipeline_leads')
      .select('pipeline_stage')
      .eq('id', leadId)
      .single();

    if (lead && ['NEEDS_CALL', 'NO_RESPONSE'].includes(lead.pipeline_stage)) {
      updates.pipeline_stage = 'CALLED';
    }

    await this.doUpdateLead(leadId, updates);

    return activity;
  }

  // ==================== DATA MIGRATION ====================

  migrateWarmLeads(): Observable<any> {
    return from(this.doMigrateWarmLeads());
  }

  private async doMigrateWarmLeads(): Promise<any> {
    const { data: users, error: usersError } = await this.supabase
      .from('users')
      .select('id, created_at')
      .eq('role', 'CLIENT');

    if (usersError) throw usersError;

    const results: any[] = [];

    for (const user of users || []) {
      const { count: completedBookings } = await this.supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('status', 'completed');

      if ((completedBookings || 0) > 0) continue;

      const { data: existing } = await this.supabase
        .from('sales_pipeline_leads')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existing) continue;

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
