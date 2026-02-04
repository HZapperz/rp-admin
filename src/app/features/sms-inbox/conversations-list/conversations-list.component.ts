import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SMSService, SMSConversation, ConversationStats } from '../../../core/services/sms.service';

@Component({
  selector: 'app-conversations-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conversations-list.component.html',
  styleUrls: ['./conversations-list.component.scss']
})
export class ConversationsListComponent implements OnInit, OnDestroy {
  conversations: SMSConversation[] = [];
  stats: ConversationStats | null = null;
  isLoading = true;
  error: string | null = null;

  // Filters
  selectedStatus: string = 'all';
  searchTerm: string = '';

  private destroy$ = new Subject<void>();

  constructor(
    private smsService: SMSService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadStats();
    this.loadConversations();

    // Auto-refresh every 30 seconds
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadConversations();
        this.loadStats();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStats() {
    this.smsService.getStats().subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (err) => {
        console.error('Error loading stats:', err);
      }
    });
  }

  loadConversations() {
    const options: { status?: string } = {};

    if (this.selectedStatus !== 'all') {
      options.status = this.selectedStatus;
    }

    this.smsService.getConversations(options).subscribe({
      next: (response) => {
        this.conversations = response.conversations;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading conversations:', err);
        this.error = 'Failed to load conversations';
        this.isLoading = false;
      }
    });
  }

  onStatusFilterChange(event: Event) {
    this.selectedStatus = (event.target as HTMLSelectElement).value;
    this.loadConversations();
  }

  onSearchChange(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    // Filter locally for responsiveness
  }

  getFilteredConversations(): SMSConversation[] {
    if (!this.searchTerm) {
      return this.conversations;
    }

    const term = this.searchTerm.toLowerCase();
    return this.conversations.filter(c =>
      c.user_name?.toLowerCase().includes(term) ||
      c.phone_number.includes(term) ||
      c.last_message?.toLowerCase().includes(term)
    );
  }

  openConversation(conversation: SMSConversation) {
    this.router.navigate(['/sms-inbox', conversation.id]);
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

  getUserTypeLabel(userType: string): string {
    const labels: Record<string, string> = {
      'client': 'Client',
      'groomer': 'Groomer',
      'admin': 'Admin'
    };
    return labels[userType] || userType;
  }

  formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
