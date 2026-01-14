import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  SessionRecordingService,
  SessionAnalytics
} from '../../../core/services/session-recording.service';

type TimePeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';

@Component({
  selector: 'app-sessions-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sessions-analytics.component.html',
  styleUrls: ['./sessions-analytics.component.scss']
})
export class SessionsAnalyticsComponent implements OnInit {
  analytics: SessionAnalytics | null = null;
  isLoading = true;
  selectedPeriod: TimePeriod = 'week';

  periods: { value: TimePeriod; label: string }[] = [
    { value: 'week', label: '7 Days' },
    { value: 'month', label: '30 Days' },
    { value: 'quarter', label: '90 Days' },
    { value: 'year', label: 'Year' },
    { value: 'all', label: 'All Time' }
  ];

  constructor(
    private sessionService: SessionRecordingService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadAnalytics();
  }

  loadAnalytics() {
    this.isLoading = true;
    this.sessionService.getAnalytics(this.selectedPeriod).subscribe({
      next: (analytics) => {
        this.analytics = analytics;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading analytics:', err);
        this.isLoading = false;
      }
    });
  }

  selectPeriod(period: TimePeriod) {
    this.selectedPeriod = period;
    this.loadAnalytics();
  }

  goBack() {
    this.router.navigate(['/sessions']);
  }

  getPeriodLabel(): string {
    const period = this.periods.find(p => p.value === this.selectedPeriod);
    return period ? period.label : '';
  }
}
