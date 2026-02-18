/**
 * Sales Pipeline Types
 */

// Pipeline stage enum (includes DORMANT for auto-archived leads)
export type PipelineStage = 'NEW' | 'TEXTED' | 'NO_RESPONSE' | 'NEEDS_CALL' | 'CALLED' | 'BOOKED' | 'CONVERTED' | 'LOST' | 'DORMANT';

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
  { stage: 'BOOKED', label: 'Booked', color: '#06b6d4', bgColor: '#ecfeff', description: 'Has a pending/confirmed booking' },
  { stage: 'CONVERTED', label: 'Converted', color: '#22c55e', bgColor: '#f0fdf4', description: 'Made a booking' },
  { stage: 'LOST', label: 'Lost', color: '#6b7280', bgColor: '#f9fafb', description: 'Gave up' },
  { stage: 'DORMANT', label: 'Dormant', color: '#9ca3af', bgColor: '#f3f4f6', description: 'No activity for 30+ days' },
];

// Active stages (shown as main Kanban columns)
export const ACTIVE_STAGES: PipelineStage[] = ['NEW', 'TEXTED', 'NO_RESPONSE', 'NEEDS_CALL', 'CALLED', 'BOOKED'];
// End/archive stages (toggled visibility)
export const END_STAGES: PipelineStage[] = ['CONVERTED', 'LOST', 'DORMANT'];

// ==================== CONTACT ACTIVITY TYPES ====================

export type ContactActivityType =
  | 'SMS_SENT'
  | 'SMS_RECEIVED'
  | 'CALLED'
  | 'CALL_OUTCOME'
  | 'NOTE'
  | 'STAGE_CHANGE'
  | 'AUTO_ACTION';

export type ContactOutcome =
  | 'ANSWERED'
  | 'NO_ANSWER'
  | 'LEFT_VM'
  | 'REPLIED'
  | 'BOOKED'
  | 'DECLINED';

export interface ContactActivity {
  id: string;
  lead_id: string;
  user_id: string | null;
  activity_type: ContactActivityType;
  outcome: ContactOutcome | null;
  notes: string | null;
  metadata: Record<string, any>;
  admin_id: string | null;
  created_at: string;
}

// ==================== SMART PIPELINE TYPES ====================

export interface SuggestedAction {
  action: string;
  reason: string;
  icon: string; // Material icon name
  priority: 'high' | 'medium' | 'low';
}

export interface PipelineNudge {
  message: string;
  count: number;
  stage: PipelineStage | null;
  icon: string;
  severity: 'warning' | 'info' | 'error';
}

export interface PipelineAutomation {
  id: string;
  name: string;
  trigger_type: 'TIME_IN_STAGE' | 'NEW_SIGNUP' | 'BOOKING_COMPLETED' | 'NO_ACTIVITY';
  trigger_config: Record<string, any>;
  action_type: 'MOVE_STAGE' | 'SEND_SMS' | 'CREATE_LEAD';
  action_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export interface ZipProximity {
  id: string;
  zip_code: string;
  nearby_zips: string[];
  city_name: string | null;
  is_active: boolean;
}

// ==================== CORE LEAD TYPES ====================

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
  priority_score: number;
  suggested_action: string | null;
  suggested_action_reason: string | null;
  last_activity_at: string | null;
  geo_boost: boolean;
  signup_source: string | null;
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
  activities: ContactActivity[];
  computed_suggested_action: SuggestedAction | null;
  days_in_stage: number;
}

// Create/update DTOs
export interface CreatePipelineLeadDto {
  user_id: string;
  pipeline_stage?: PipelineStage;
  priority?: number;
  notes?: string;
  assigned_admin_id?: string;
  geo_boost?: boolean;
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
  priority_score?: number;
  suggested_action?: string;
  suggested_action_reason?: string;
  last_activity_at?: string;
  geo_boost?: boolean;
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
  dormant_count: number;
  avg_days_to_convert: number;
  nudges: PipelineNudge[];
}

// SMS template for pipeline (now DB-backed)
export interface SMSTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
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
  priorityLevel?: 'high' | 'medium' | 'low';
}

// Priority level thresholds
export const PRIORITY_THRESHOLDS = {
  high: 70,
  medium: 40,
} as const;

// ==================== HELPER FUNCTIONS ====================

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

export function getPriorityLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= PRIORITY_THRESHOLDS.high) return 'high';
  if (score >= PRIORITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function getPriorityColor(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return '#22c55e';
    case 'medium': return '#eab308';
    case 'low': return '#ef4444';
  }
}

export function getActivityIcon(type: ContactActivityType): string {
  switch (type) {
    case 'SMS_SENT': return 'sms';
    case 'SMS_RECEIVED': return 'chat';
    case 'CALLED': return 'phone';
    case 'CALL_OUTCOME': return 'phone_callback';
    case 'NOTE': return 'note';
    case 'STAGE_CHANGE': return 'swap_horiz';
    case 'AUTO_ACTION': return 'smart_toy';
  }
}
