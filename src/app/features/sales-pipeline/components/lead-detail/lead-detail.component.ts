import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  PipelineLeadWithDetails,
  PipelineStage,
  PIPELINE_STAGES,
  getStageConfig,
  getCompletionCount
} from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';
import { SMSConversation, SMSMessage } from '../../../../core/services/sms.service';
import { ComposeSmsComponent } from '../compose-sms/compose-sms.component';

@Component({
  selector: 'app-lead-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ComposeSmsComponent],
  templateUrl: './lead-detail.component.html',
  styleUrls: ['./lead-detail.component.scss']
})
export class LeadDetailComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  leadId: string = '';
  lead: PipelineLeadWithDetails | null = null;

  // Conversation
  conversation: SMSConversation | null = null;
  messages: SMSMessage[] = [];

  // UI State
  isLoading = true;
  error: string | null = null;
  showSmsModal = false;

  // Notes
  isEditingNotes = false;
  notesInput = '';
  isSavingNotes = false;

  // Reply
  replyMessage = '';
  isSendingReply = false;
  private shouldScrollToBottom = false;

  // Stage change
  showStageMenu = false;
  stages = PIPELINE_STAGES;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private pipelineService: SalesPipelineService
  ) {}

  ngOnInit(): void {
    this.leadId = this.route.snapshot.paramMap.get('id') || '';

    if (this.leadId) {
      this.loadLead();

      // Auto-refresh messages every 10 seconds
      interval(10000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          this.refreshMessages();
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  loadLead(): void {
    this.isLoading = true;
    this.error = null;

    this.pipelineService.getLead(this.leadId).subscribe({
      next: (lead) => {
        if (!lead) {
          this.error = 'Lead not found';
          this.isLoading = false;
          return;
        }

        this.lead = lead;
        this.notesInput = lead.notes || '';
        this.isLoading = false;

        // Load conversation
        this.loadConversation();
      },
      error: (err) => {
        console.error('Error loading lead:', err);
        this.error = 'Failed to load lead';
        this.isLoading = false;
      }
    });
  }

  loadConversation(): void {
    if (!this.lead) return;

    this.pipelineService.getConversation(this.lead.user_id).subscribe({
      next: (data) => {
        this.conversation = data.conversation;
        this.messages = data.messages;
        this.shouldScrollToBottom = true;
      }
    });
  }

  refreshMessages(): void {
    if (!this.lead || this.isSendingReply) return;

    this.pipelineService.getConversation(this.lead.user_id).subscribe({
      next: (data) => {
        if (data.messages.length > this.messages.length) {
          this.messages = data.messages;
          this.shouldScrollToBottom = true;
        }
      }
    });
  }

  // Navigation
  goBack(): void {
    this.router.navigate(['/sales-pipeline']);
  }

  viewClientProfile(): void {
    if (this.lead) {
      this.router.navigate(['/clients', this.lead.user_id]);
    }
  }

  // Stage Management
  get stageConfig() {
    return this.lead ? getStageConfig(this.lead.pipeline_stage) : null;
  }

  toggleStageMenu(): void {
    this.showStageMenu = !this.showStageMenu;
  }

  changeStage(newStage: PipelineStage): void {
    if (!this.lead || newStage === this.lead.pipeline_stage) {
      this.showStageMenu = false;
      return;
    }

    this.pipelineService.moveToStage(this.lead.id, newStage).subscribe({
      next: () => {
        if (this.lead) {
          this.lead.pipeline_stage = newStage;
          this.lead.stage_changed_at = new Date().toISOString();
          this.lead.days_in_stage = 0;
        }
        this.showStageMenu = false;
      },
      error: (err) => {
        console.error('Error changing stage:', err);
      }
    });
  }

  // Notes
  startEditNotes(): void {
    this.isEditingNotes = true;
  }

  cancelEditNotes(): void {
    this.notesInput = this.lead?.notes || '';
    this.isEditingNotes = false;
  }

  saveNotes(): void {
    if (!this.lead) return;

    this.isSavingNotes = true;

    this.pipelineService.updateLead(this.lead.id, { notes: this.notesInput }).subscribe({
      next: () => {
        if (this.lead) {
          this.lead.notes = this.notesInput;
        }
        this.isEditingNotes = false;
        this.isSavingNotes = false;
      },
      error: (err) => {
        console.error('Error saving notes:', err);
        this.isSavingNotes = false;
      }
    });
  }

  // SMS
  openSmsModal(): void {
    this.showSmsModal = true;
  }

  closeSmsModal(): void {
    this.showSmsModal = false;
  }

  onSmsSent(): void {
    this.closeSmsModal();
    this.loadConversation();
  }

  sendReply(): void {
    if (!this.replyMessage.trim() || !this.conversation || this.isSendingReply) return;

    this.isSendingReply = true;
    const content = this.replyMessage.trim();
    this.replyMessage = '';

    this.pipelineService.sendReply(this.conversation.id, content).subscribe({
      next: () => {
        this.loadConversation();
        this.isSendingReply = false;
      },
      error: (err) => {
        console.error('Error sending reply:', err);
        this.replyMessage = content;
        this.isSendingReply = false;
      }
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendReply();
    }
  }

  // Call
  makeCall(): void {
    if (!this.lead?.user.phone) return;

    window.location.href = `tel:${this.lead.user.phone}`;

    // Update last_call_at
    this.pipelineService.updateLead(this.lead.id, {
      last_call_at: new Date().toISOString(),
      pipeline_stage: ['NEEDS_CALL', 'NO_RESPONSE'].includes(this.lead.pipeline_stage) ? 'CALLED' : this.lead.pipeline_stage
    }).subscribe({
      next: () => {
        this.loadLead();
      }
    });
  }

  // Helpers
  get completionCount(): number {
    return this.lead ? getCompletionCount(this.lead.completion_status) : 0;
  }

  formatPhone(phone: string | null): string {
    return this.pipelineService.formatPhone(phone);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatMessageDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
    }
  }

  shouldShowDateDivider(message: SMSMessage, index: number): boolean {
    if (index === 0) return true;

    const currentDate = new Date(message.created_at).toDateString();
    const previousDate = new Date(this.messages[index - 1].created_at).toDateString();

    return currentDate !== previousDate;
  }

  getMessageClass(message: SMSMessage): string {
    return message.direction === 'inbound' ? 'message-inbound' : 'message-outbound';
  }

  getIntentBadge(intent: string | null): { label: string; color: string } | null {
    if (!intent) return null;

    const badges: Record<string, { label: string; color: string }> = {
      'CONFIRM': { label: 'Confirm', color: '#22c55e' },
      'CANCEL': { label: 'Cancel', color: '#ef4444' },
      'RESCHEDULE': { label: 'Reschedule', color: '#f59e0b' },
      'STATUS': { label: 'Status', color: '#3b82f6' },
      'QUESTION': { label: 'Question', color: '#8b5cf6' },
      'COMPLAINT': { label: 'Complaint', color: '#dc2626' },
      'STOP': { label: 'Opt-out', color: '#6b7280' }
    };

    return badges[intent] || null;
  }

  private scrollToBottom(): void {
    try {
      const container = this.messagesContainer?.nativeElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling:', err);
    }
  }
}
