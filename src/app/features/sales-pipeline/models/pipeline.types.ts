/**
 * Sales Pipeline Types
 */

// Pipeline stage enum
export type PipelineStage = 'NEW' | 'TEXTED' | 'NO_RESPONSE' | 'NEEDS_CALL' | 'CALLED' | 'CONVERTED' | 'LOST';

// Stage configuration with colors and labels
export interface StageConfig {
  stage: PipelineStage;
  label: string;
  color: string;
  bgColor: string;
  description: string;
}

export const PIPELINE_STAGES: StageConfig[] = [
  { stage: 'NEW', label: 'New', color: '#3b82f6', bgColor: '#eff6ff', description: 'Just signed up' },
  { stage: 'TEXTED', label: 'Texted', color: '#8b5cf6', bgColor: '#f5f3ff', description: 'First contact SMS sent' },
  { stage: 'NO_RESPONSE', label: 'No Response', color: '#f97316', bgColor: '#fff7ed', description: 'No reply after 5 days' },
  { stage: 'NEEDS_CALL', label: 'Needs Call', color: '#eab308', bgColor: '#fefce8', description: 'Flagged for phone follow-up' },
  { stage: 'CALLED', label: 'Called', color: '#14b8a6', bgColor: '#f0fdfa', description: 'Phone call made' },
  { stage: 'CONVERTED', label: 'Converted', color: '#22c55e', bgColor: '#f0fdf4', description: 'Made a booking' },
  { stage: 'LOST', label: 'Lost', color: '#6b7280', bgColor: '#f9fafb', description: 'Gave up' },
];

// Core pipeline lead entity
export interface PipelineLead {
  id: string;
  user_id: string;
  pipeline_stage: PipelineStage;
  last_sms_sent_at: string | null;
  last_sms_replied_at: string | null;
  last_call_at: string | null;
  stage_changed_at: string;
  converted_booking_id: string | null;
  lost_reason: string | null;
  assigned_admin_id: string | null;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Extended lead with user details
export interface PipelineLeadWithDetails extends PipelineLead {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
    created_at: string;
  };
  pets: Array<{
    id: string;
    name: string;
    breed: string | null;
    size_category: string | null;
  }>;
  addresses: Array<{
    id: string;
    street: string;
    city: string;
    zip_code: string;
    is_default: boolean;
  }>;
  payment_methods: Array<{
    id: string;
    last4: string;
    brand: string;
    is_default: boolean;
  }>;
  completion_status: {
    profile_complete: boolean;
    has_pet: boolean;
    has_address: boolean;
    has_payment_method: boolean;
    has_started_booking: boolean;
  };
  conversation?: {
    id: string;
    status: string;
    unread_count: number;
    last_message_at: string | null;
  };
  days_in_stage: number;
}

// Create/update DTOs
export interface CreatePipelineLeadDto {
  user_id: string;
  pipeline_stage?: PipelineStage;
  priority?: number;
  notes?: string;
  assigned_admin_id?: string;
}

export interface UpdatePipelineLeadDto {
  pipeline_stage?: PipelineStage;
  last_sms_sent_at?: string;
  last_sms_replied_at?: string;
  last_call_at?: string;
  converted_booking_id?: string;
  lost_reason?: string;
  assigned_admin_id?: string | null;
  priority?: number;
  notes?: string;
}

// Pipeline automation log
export interface PipelineAutomationLog {
  id: string;
  lead_id: string;
  automation_type: string;
  triggered_at: string;
  status: 'success' | 'failed';
  error_message: string | null;
  metadata: Record<string, any>;
}

// Pipeline statistics
export interface PipelineStats {
  total: number;
  by_stage: Record<PipelineStage, number>;
  needs_attention: number;
  converted_this_week: number;
  lost_this_week: number;
}

// SMS template for pipeline
export interface SMSTemplate {
  id: string;
  name: string;
  content: string;
  category: 'welcome' | 'follow_up' | 'reminder' | 'promo' | 'custom';
  variables: string[];
}

// Opt-out entry
export interface OptOut {
  id: string;
  phone_number: string;
  opted_out_at: string;
  reason: string | null;
  user_name: string | null;
}

// Bulk SMS request
export interface BulkSMSRequest {
  lead_ids: string[];
  template_id?: string;
  custom_message?: string;
}

// Drag and drop event
export interface LeadMoveEvent {
  leadId: string;
  fromStage: PipelineStage;
  toStage: PipelineStage;
}

// Filter options for pipeline view
export interface PipelineFilters {
  stages?: PipelineStage[];
  assignedTo?: string;
  minPriority?: number;
  hasUnreadSMS?: boolean;
  daysInStageMin?: number;
  searchTerm?: string;
}

// Helper functions
export function getStageConfig(stage: PipelineStage): StageConfig {
  return PIPELINE_STAGES.find(s => s.stage === stage) || PIPELINE_STAGES[0];
}

export function getCompletionPercentage(status: PipelineLeadWithDetails['completion_status']): number {
  const checks = [
    status.profile_complete,
    status.has_pet,
    status.has_address,
    status.has_payment_method,
    status.has_started_booking
  ];
  return (checks.filter(Boolean).length / checks.length) * 100;
}

export function getCompletionCount(status: PipelineLeadWithDetails['completion_status']): number {
  const checks = [
    status.profile_complete,
    status.has_pet,
    status.has_address,
    status.has_payment_method,
    status.has_started_booking
  ];
  return checks.filter(Boolean).length;
}

export function calculateDaysInStage(stageChangedAt: string): number {
  const changed = new Date(stageChangedAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - changed.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}
