import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { SupabaseService } from '../../../core/services/supabase.service';

interface Recipient {
  id: string;
  email: string;
  name: string;
  petName: string;
  status: 'pending' | 'sending' | 'sent' | 'error' | 'skipped';
  reason?: string;
  emailId?: string;
}

interface PreviewResponse {
  mode: string;
  summary: {
    totalClients: number;
    excludedTestAccounts: number;
    eligibleToSend: number;
  };
  recipients: { id: string; email: string; name: string; petName: string }[];
}

type Phase = 'loading' | 'preview' | 'sending' | 'complete';

@Component({
  selector: 'app-email-campaign-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-campaign-view.component.html',
  styleUrls: ['./email-campaign-view.component.scss'],
})
export class EmailCampaignViewComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private supabase = inject(SupabaseService);
  private apiUrl = environment.apiUrl;

  phase: Phase = 'loading';
  error: string | null = null;

  // Preview data
  recipients: Recipient[] = [];
  totalClients = 0;
  excludedCount = 0;
  eligibleCount = 0;

  // Sending state
  currentIndex = 0;
  sentCount = 0;
  errorCount = 0;
  skippedCount = 0;
  isPaused = false;
  isStopped = false;
  elapsedSeconds = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private sendingPromise: Promise<void> | null = null;

  get remainingCount(): number {
    return this.eligibleCount - this.sentCount - this.errorCount - this.skippedCount;
  }

  get progressPercent(): number {
    if (this.eligibleCount === 0) return 0;
    return Math.round(((this.sentCount + this.errorCount + this.skippedCount) / this.eligibleCount) * 100);
  }

  get elapsedFormatted(): string {
    const mins = Math.floor(this.elapsedSeconds / 60);
    const secs = this.elapsedSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  get failedRecipients(): Recipient[] {
    return this.recipients.filter(r => r.status === 'error');
  }

  ngOnInit(): void {
    this.loadPreview();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.isStopped = true;
  }

  private getAuthHeaders(): Record<string, string> {
    const session = this.supabase.session;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  loadPreview(): void {
    this.phase = 'loading';
    this.error = null;

    this.http
      .get<PreviewResponse>(`${this.apiUrl}/api/admin/send-service-update`, {
        headers: this.getAuthHeaders(),
      })
      .subscribe({
        next: (data) => {
          this.totalClients = data.summary.totalClients;
          this.excludedCount = data.summary.excludedTestAccounts;
          this.eligibleCount = data.summary.eligibleToSend;
          this.recipients = data.recipients.map((r) => ({
            ...r,
            status: 'pending' as const,
          }));
          this.phase = 'preview';
        },
        error: (err) => {
          this.error = err.error?.error || 'Failed to load recipients';
          this.phase = 'preview';
        },
      });
  }

  async startSending(): Promise<void> {
    this.phase = 'sending';
    this.currentIndex = 0;
    this.sentCount = 0;
    this.errorCount = 0;
    this.skippedCount = 0;
    this.isPaused = false;
    this.isStopped = false;
    this.elapsedSeconds = 0;

    // Reset all statuses
    this.recipients.forEach((r) => (r.status = 'pending'));

    this.startTimer();
    this.sendingPromise = this.sendLoop();
    await this.sendingPromise;
  }

  private async sendLoop(): Promise<void> {
    for (let i = 0; i < this.recipients.length; i++) {
      if (this.isStopped) {
        // Mark remaining as skipped
        for (let j = i; j < this.recipients.length; j++) {
          if (this.recipients[j].status === 'pending') {
            this.recipients[j].status = 'skipped';
            this.recipients[j].reason = 'Stopped by user';
            this.skippedCount++;
          }
        }
        break;
      }

      // Wait while paused
      while (this.isPaused && !this.isStopped) {
        await this.sleep(200);
      }

      if (this.isStopped) {
        for (let j = i; j < this.recipients.length; j++) {
          if (this.recipients[j].status === 'pending') {
            this.recipients[j].status = 'skipped';
            this.recipients[j].reason = 'Stopped by user';
            this.skippedCount++;
          }
        }
        break;
      }

      this.currentIndex = i;
      const recipient = this.recipients[i];
      recipient.status = 'sending';

      try {
        const response = await fetch(`${this.apiUrl}/api/admin/send-service-update`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ userId: recipient.id }),
        });

        const data = await response.json();

        if (!response.ok) {
          recipient.status = 'error';
          recipient.reason = data.error || `HTTP ${response.status}`;
          this.errorCount++;
        } else if (data.success) {
          recipient.status = 'sent';
          recipient.emailId = data.result?.emailId;
          this.sentCount++;
        } else {
          recipient.status = 'error';
          recipient.reason = data.result?.reason || 'Send failed';
          this.errorCount++;
        }
      } catch (err) {
        recipient.status = 'error';
        recipient.reason = err instanceof Error ? err.message : 'Network error';
        this.errorCount++;
      }
    }

    this.stopTimer();
    this.phase = 'complete';
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  stop(): void {
    this.isStopped = true;
    this.isPaused = false;
  }

  async retryFailed(): Promise<void> {
    const failed = this.recipients.filter((r) => r.status === 'error');
    if (failed.length === 0) return;

    this.phase = 'sending';
    this.isPaused = false;
    this.isStopped = false;
    this.errorCount = 0;
    this.elapsedSeconds = 0;

    // Reset failed ones to pending
    failed.forEach((r) => {
      r.status = 'pending';
      r.reason = undefined;
    });

    this.startTimer();

    for (let i = 0; i < failed.length; i++) {
      if (this.isStopped) {
        failed.slice(i).forEach((r) => {
          if (r.status === 'pending') {
            r.status = 'skipped';
            r.reason = 'Stopped by user';
            this.skippedCount++;
          }
        });
        break;
      }

      while (this.isPaused && !this.isStopped) {
        await this.sleep(200);
      }

      if (this.isStopped) break;

      const recipient = failed[i];
      this.currentIndex = this.recipients.indexOf(recipient);
      recipient.status = 'sending';

      try {
        const response = await fetch(`${this.apiUrl}/api/admin/send-service-update`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ userId: recipient.id }),
        });

        const data = await response.json();

        if (!response.ok) {
          recipient.status = 'error';
          recipient.reason = data.error || `HTTP ${response.status}`;
          this.errorCount++;
        } else if (data.success) {
          recipient.status = 'sent';
          recipient.emailId = data.result?.emailId;
          this.sentCount++;
        } else {
          recipient.status = 'error';
          recipient.reason = data.result?.reason || 'Send failed';
          this.errorCount++;
        }
      } catch (err) {
        recipient.status = 'error';
        recipient.reason = err instanceof Error ? err.message : 'Network error';
        this.errorCount++;
      }
    }

    this.stopTimer();
    this.phase = 'complete';
  }

  resetCampaign(): void {
    this.isStopped = true;
    this.isPaused = false;
    this.stopTimer();
    this.loadPreview();
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
