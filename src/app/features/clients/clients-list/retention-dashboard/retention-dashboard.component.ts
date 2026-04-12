import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ClientService, RetentionAnalysis, OneTimerClient } from '../../../../core/services/client.service';

@Component({
  selector: 'app-retention-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './retention-dashboard.component.html',
  styleUrls: ['./retention-dashboard.component.scss']
})
export class RetentionDashboardComponent implements OnInit {
  private clientService = inject(ClientService);
  private router = inject(Router);

  analysis: RetentionAnalysis | null = null;
  isLoading = true;
  isRefreshing = false;

  // Goal editing
  editingGoal = false;
  goalDraft = 250;
  savingGoal = false;

  ngOnInit() {
    this.loadAnalysis();
  }

  async loadAnalysis(force = false) {
    this.isLoading = !this.analysis;
    this.isRefreshing = !!this.analysis;
    try {
      this.analysis = await this.clientService.getRetentionAnalysis(force);
    } finally {
      this.isLoading = false;
      this.isRefreshing = false;
    }
  }

  refresh() {
    this.loadAnalysis(true);
  }

  get goalProgress(): number {
    if (!this.analysis) return 0;
    return Math.min((this.analysis.funnel.active_recurring / this.analysis.recurringGoal) * 100, 100);
  }

  get totalEverBooked(): number {
    if (!this.analysis) return 0;
    const f = this.analysis.funnel;
    return f.active_recurring + f.recently_groomed + f.one_time_recent + f.lapsing + f.churned;
  }

  startEditGoal() {
    this.goalDraft = this.analysis?.recurringGoal ?? 250;
    this.editingGoal = true;
  }

  async saveGoal() {
    this.savingGoal = true;
    try {
      await this.clientService.saveRecurringGoal(this.goalDraft);
      if (this.analysis) {
        this.analysis = { ...this.analysis, recurringGoal: this.goalDraft };
      }
      this.editingGoal = false;
    } finally {
      this.savingGoal = false;
    }
  }

  cancelEditGoal() {
    this.editingGoal = false;
  }

  navigateToClient(clientId: string) {
    this.router.navigate(['/clients', clientId]);
  }

  getScoreBadgeClass(label: string): string {
    switch (label) {
      case 'likely_return': return 'badge-green';
      case 'uncertain': return 'badge-amber';
      default: return 'badge-red';
    }
  }

  getScoreLabel(label: string): string {
    switch (label) {
      case 'likely_return': return 'Likely Return';
      case 'uncertain': return 'Uncertain';
      default: return 'At Risk';
    }
  }

  formatCurrency(n: number): string {
    return n === 0 ? '—' : `$${n.toFixed(0)}`;
  }

  get oneTimerStats(): { tipped: number; avgTip: number; usedDiscount: number; avgBooking: number } {
    const ot = this.analysis?.oneTimers ?? [];
    if (ot.length === 0) return { tipped: 0, avgTip: 0, usedDiscount: 0, avgBooking: 0 };
    const tipped = ot.filter(o => o.tip_amount > 0);
    return {
      tipped: tipped.length,
      avgTip: tipped.length > 0 ? tipped.reduce((s, o) => s + o.tip_amount, 0) / tipped.length : 0,
      usedDiscount: ot.filter(o => o.discount_amount > 0).length,
      avgBooking: ot.reduce((s, o) => s + o.total_amount, 0) / ot.length
    };
  }

  get likelyReturnCount(): number {
    return this.analysis?.oneTimers.filter(o => o.segment_label === 'likely_return').length ?? 0;
  }

  get uncertainCount(): number {
    return this.analysis?.oneTimers.filter(o => o.segment_label === 'uncertain').length ?? 0;
  }

  get atRiskCount(): number {
    return this.analysis?.oneTimers.filter(o => o.segment_label === 'churned').length ?? 0;
  }

  formatTime(d: Date): string {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
}
