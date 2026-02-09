import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  SessionRecordingService,
  RecordingSession,
  SessionFilters,
  SessionUser
} from '../../../core/services/session-recording.service';

@Component({
  selector: 'app-sessions-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sessions-list.component.html',
  styleUrls: ['./sessions-list.component.scss']
})
export class SessionsListComponent implements OnInit {
  sessions: RecordingSession[] = [];
  isLoading = true;

  // Filters
  statusFilter: 'all' | 'converted' | 'dropped' | 'signed_up' = 'all';
  hasRageClicksFilter = false;
  hideNoEventsFilter = true; // Default to hiding sessions without replay data

  // Stats
  stats = {
    total: 0,
    signedUp: 0,
    converted: 0,
    withRageClicks: 0
  };

  constructor(
    private sessionService: SessionRecordingService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadStats();
    this.loadSessions();
  }

  loadStats() {
    this.sessionService.getFunnelStats(7).subscribe({
      next: (stats) => {
        this.stats = stats;
      },
      error: (err) => console.error('Error loading stats:', err)
    });
  }

  loadSessions() {
    this.isLoading = true;

    const filters: SessionFilters = {
      status: this.statusFilter,
      hasRageClicks: this.hasRageClicksFilter,
      hideNoEvents: this.hideNoEventsFilter
    };

    this.sessionService.getSessions(filters, 100).subscribe({
      next: (sessions) => {
        this.sessions = sessions;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading sessions:', err);
        this.isLoading = false;
      }
    });
  }

  onFilterChange() {
    this.loadSessions();
  }

  viewSession(session: RecordingSession) {
    this.router.navigate(['/sessions', session.session_id]);
  }

  getStatusLabel(session: RecordingSession): string {
    if (session.is_converted) return 'Converted';
    if (session.has_signed_up) return 'Signed Up';
    if (session.user_id) return 'Logged In';
    return 'Dropped';
  }

  getStatusClass(session: RecordingSession): string {
    if (session.is_converted) return 'status-converted';
    if (session.has_signed_up) return 'status-signed-up';
    if (session.user_id) return 'status-logged-in';
    return 'status-dropped';
  }

  getUserDisplay(session: RecordingSession): string {
    if (!session.user) return 'Anonymous';
    const name = [session.user.first_name, session.user.last_name].filter(Boolean).join(' ');
    return name || session.user.email || 'Anonymous';
  }

  getDeviceInfo(session: RecordingSession): string {
    const { device } = this.sessionService.parseUserAgent(session.user_agent);
    return device;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  truncateUrl(url: string | null): string {
    if (!url) return '-';
    // Remove domain, keep path
    try {
      const urlObj = new URL(url, 'http://localhost');
      return urlObj.pathname || url;
    } catch {
      return url.length > 30 ? url.substring(0, 30) + '...' : url;
    }
  }

  getConversionRate(): string {
    if (this.stats.signedUp === 0) return '0%';
    return ((this.stats.converted / this.stats.signedUp) * 100).toFixed(1) + '%';
  }

  getSignupRate(): string {
    if (this.stats.total === 0) return '0%';
    return ((this.stats.signedUp / this.stats.total) * 100).toFixed(1) + '%';
  }

  goToAnalytics() {
    this.router.navigate(['/sessions/analytics']);
  }
}
