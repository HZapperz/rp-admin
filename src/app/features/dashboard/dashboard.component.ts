import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalyticsService } from '../../core/services/analytics.service';
import { KPIData } from '../../core/models/types';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  kpis = [
    { label: 'Total Bookings', value: '0', icon: '📅', color: '#6366f1' },
    { label: 'Total Revenue', value: '$0', icon: '💰', color: '#10b981' },
    { label: 'Active Groomers', value: '0', icon: '✂️', color: '#f59e0b' },
    { label: 'Average Rating', value: '0.0', icon: '⭐', color: '#ec4899' }
  ];

  isLoading = true;
  error: string | null = null;

  constructor(private analyticsService: AnalyticsService) {}

  async ngOnInit(): Promise<void> {
    await this.loadKPIs();
  }

  private async loadKPIs(): Promise<void> {
    try {
      this.isLoading = true;
      const kpiData: KPIData = await this.analyticsService.getDashboardKPIs();

      this.kpis = [
        {
          label: 'Total Bookings',
          value: kpiData.totalBookings.toString(),
          icon: '📅',
          color: '#6366f1'
        },
        {
          label: 'Total Revenue',
          value: `$${kpiData.totalRevenue.toFixed(2)}`,
          icon: '💰',
          color: '#10b981'
        },
        {
          label: 'Active Groomers',
          value: kpiData.activeGroomers.toString(),
          icon: '✂️',
          color: '#f59e0b'
        },
        {
          label: 'Average Rating',
          value: kpiData.averageRating.toFixed(1),
          icon: '⭐',
          color: '#ec4899'
        }
      ];

      this.error = null;
    } catch (err: any) {
      console.error('Error loading KPIs:', err);
      this.error = 'Failed to load dashboard data. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
