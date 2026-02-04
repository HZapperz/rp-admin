import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SMSService, SMSConversation, SMSMessage } from '../../../core/services/sms.service';

@Component({
  selector: 'app-conversation-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conversation-detail.component.html',
  styleUrls: ['./conversation-detail.component.scss']
})
export class ConversationDetailComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  conversationId: string = '';
  conversation: SMSConversation | null = null;
  messages: SMSMessage[] = [];

  isLoading = true;
  isSending = false;
  error: string | null = null;

  newMessage: string = '';
  private shouldScrollToBottom = false;
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private smsService: SMSService
  ) {}

  ngOnInit() {
    this.conversationId = this.route.snapshot.paramMap.get('id') || '';

    if (this.conversationId) {
      this.loadConversation();

      // Auto-refresh every 10 seconds
      interval(10000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          this.refreshMessages();
        });
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  loadConversation() {
    this.isLoading = true;
    this.smsService.getConversation(this.conversationId).subscribe({
      next: (response) => {
        this.conversation = response.conversation;
        this.messages = response.messages;
        this.isLoading = false;
        this.shouldScrollToBottom = true;
      },
      error: (err) => {
        console.error('Error loading conversation:', err);
        this.error = 'Failed to load conversation';
        this.isLoading = false;
      }
    });
  }

  refreshMessages() {
    if (!this.isLoading && !this.isSending) {
      this.smsService.getConversation(this.conversationId).subscribe({
        next: (response) => {
          // Check if there are new messages
          if (response.messages.length > this.messages.length) {
            this.messages = response.messages;
            this.shouldScrollToBottom = true;
          }
        }
      });
    }
  }

  sendMessage() {
    if (!this.newMessage.trim() || this.isSending) return;

    this.isSending = true;
    const content = this.newMessage.trim();
    this.newMessage = '';

    this.smsService.sendReply(this.conversationId, { content }).subscribe({
      next: (response) => {
        this.messages.push(response.message);
        this.shouldScrollToBottom = true;
        this.isSending = false;
      },
      error: (err) => {
        console.error('Error sending message:', err);
        this.newMessage = content; // Restore message on error
        this.isSending = false;
        // Show error toast or notification
      }
    });
  }

  resolveConversation() {
    if (!this.conversation) return;

    this.smsService.resolveConversation(this.conversationId).subscribe({
      next: () => {
        if (this.conversation) {
          this.conversation.status = 'resolved';
        }
      },
      error: (err) => {
        console.error('Error resolving conversation:', err);
      }
    });
  }

  escalateConversation() {
    if (!this.conversation) return;

    this.smsService.updateConversation(this.conversationId, { status: 'escalated' }).subscribe({
      next: () => {
        if (this.conversation) {
          this.conversation.status = 'escalated';
        }
      },
      error: (err) => {
        console.error('Error escalating conversation:', err);
      }
    });
  }

  goBack() {
    this.router.navigate(['/sms-inbox']);
  }

  private scrollToBottom() {
    try {
      const container = this.messagesContainer?.nativeElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  getMessageClass(message: SMSMessage): string {
    return message.direction === 'inbound' ? 'message-inbound' : 'message-outbound';
  }

  getMessageTypeLabel(message: SMSMessage): string | null {
    if (!message.message_type || message.message_type === 'reply') return null;

    const labels: Record<string, string> = {
      'notification': 'Auto Notification',
      'ai_response': 'AI Response',
      'admin_response': 'Admin',
      'system': 'System'
    };
    return labels[message.message_type] || null;
  }

  getIntentLabel(intent: string): string {
    const labels: Record<string, string> = {
      'CONFIRM': 'Confirm',
      'CANCEL': 'Cancel',
      'RESCHEDULE': 'Reschedule',
      'STATUS': 'Status',
      'QUESTION': 'Question',
      'COMPLAINT': 'Complaint',
      'TIP': 'Tip',
      'RATING': 'Rating',
      'HELP': 'Help',
      'STOP': 'Opt-out',
      'OTHER': 'Other'
    };
    return labels[intent] || intent;
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatDate(dateString: string): string {
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

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'active': 'status-active',
      'escalated': 'status-escalated',
      'resolved': 'status-resolved'
    };
    return classes[status] || '';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'active': 'Active',
      'escalated': 'Escalated',
      'resolved': 'Resolved'
    };
    return labels[status] || status;
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
