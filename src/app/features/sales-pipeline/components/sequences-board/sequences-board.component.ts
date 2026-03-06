import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  SequenceOverview,
  SequenceInstanceWithDetails,
  SequenceStepLog,
  SequenceStats,
  SEQUENCE_TYPE_CONFIG,
  getSequenceTypeConfig
} from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';

@Component({
  selector: 'app-sequences-board',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './sequences-board.component.html',
  styleUrls: ['./sequences-board.component.scss']
})
export class SequencesBoardComponent implements OnInit, OnDestroy {
  // Data
  overview: SequenceOverview | null = null;
  filteredInstances: SequenceInstanceWithDetails[] = [];

  // UI State
  isLoading = true;
  error: string | null = null;
  selectedType: string = 'all';
  searchTerm = '';
  sortColumn: 'user_name' | 'started_at' | 'status' | 'sequence_type' = 'started_at';
  sortDirection: 'asc' | 'desc' = 'desc';

  // Expanded rows
  expandedRows: Set<string> = new Set();
  loadingSteps: Set<string> = new Set();

  // Cancel modal
  showCancelModal = false;
  cancelTarget: SequenceInstanceWithDetails | null = null;
  cancelReason = '';
  isCancelling = false;

  // Sequence types for tabs
  sequenceTypes = [
    { key: 'all', label: 'All', icon: 'list' },
    ...Object.entries(SEQUENCE_TYPE_CONFIG).map(([key, config]) => ({
      key,
      label: config.label,
      icon: config.icon
    }))
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private pipelineService: SalesPipelineService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();

    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.refreshData());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.isLoading = true;
    this.error = null;

    this.pipelineService.getSequenceOverview().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading sequences:', err);
        this.error = 'Failed to load sequence data';
        this.isLoading = false;
      }
    });
  }

  refreshData(): void {
    if (this.isLoading) return;

    this.pipelineService.getSequenceOverview().subscribe({
      next: (overview) => {
        this.overview = overview;
        this.applyFilters();
      }
    });
  }

  // ==================== FILTERS & SORT ====================

  selectType(type: string): void {
    this.selectedType = type;
    this.applyFilters();
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilters();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.applyFilters();
  }

  onSort(column: 'user_name' | 'started_at' | 'status' | 'sequence_type'): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'user_name' ? 'asc' : 'desc';
    }
    this.applyFilters();
  }

  private applyFilters(): void {
    if (!this.overview) {
      this.filteredInstances = [];
      return;
    }

    let instances = [...this.overview.instances];

    // Filter by type
    if (this.selectedType !== 'all') {
      instances = instances.filter(i => i.sequence_type === this.selectedType);
    }

    // Filter by search
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      instances = instances.filter(i =>
        i.user_name.toLowerCase().includes(term) ||
        i.user_phone.includes(term) ||
        i.user_email?.toLowerCase().includes(term)
      );
    }

    // Sort
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    instances.sort((a, b) => {
      switch (this.sortColumn) {
        case 'user_name':
          return a.user_name.localeCompare(b.user_name) * dir;
        case 'started_at':
          return (new Date(a.started_at).getTime() - new Date(b.started_at).getTime()) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        case 'sequence_type':
          return a.sequence_type.localeCompare(b.sequence_type) * dir;
        default:
          return 0;
      }
    });

    this.filteredInstances = instances;
  }

  // ==================== EXPANDABLE ROWS ====================

  toggleRow(instance: SequenceInstanceWithDetails): void {
    if (this.expandedRows.has(instance.id)) {
      this.expandedRows.delete(instance.id);
    } else {
      this.expandedRows.add(instance.id);
      if (!instance.steps) {
        this.loadSteps(instance);
      }
    }
  }

  private loadSteps(instance: SequenceInstanceWithDetails): void {
    this.loadingSteps.add(instance.id);

    this.pipelineService.getSequenceStepLog(instance.id).subscribe({
      next: (steps) => {
        instance.steps = steps;
        this.loadingSteps.delete(instance.id);
      },
      error: () => {
        this.loadingSteps.delete(instance.id);
      }
    });
  }

  // ==================== ACTIONS ====================

  openCancelModal(instance: SequenceInstanceWithDetails, event: MouseEvent): void {
    event.stopPropagation();
    this.cancelTarget = instance;
    this.cancelReason = '';
    this.showCancelModal = true;
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
    this.cancelTarget = null;
    this.cancelReason = '';
  }

  confirmCancel(): void {
    if (!this.cancelTarget || this.isCancelling) return;

    this.isCancelling = true;
    this.pipelineService.cancelSequence(
      this.cancelTarget.user_id,
      this.cancelReason || 'Admin cancelled',
      this.cancelTarget.sequence_type
    ).subscribe({
      next: () => {
        this.isCancelling = false;
        this.closeCancelModal();
        this.loadData();
      },
      error: (err) => {
        console.error('Error cancelling sequence:', err);
        this.isCancelling = false;
      }
    });
  }

  viewInPipeline(instance: SequenceInstanceWithDetails, event: MouseEvent): void {
    event.stopPropagation();
    this.router.navigate(['/sales-pipeline/lead', instance.user_id]);
  }

  // ==================== HELPERS ====================

  getTypeConfig(type: string) {
    return getSequenceTypeConfig(type);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'active': return '#3b82f6';
      case 'completed': return '#22c55e';
      case 'converted': return '#eab308';
      case 'cancelled': return '#6b7280';
      default: return '#9ca3af';
    }
  }

  getStatusBg(status: string): string {
    switch (status) {
      case 'active': return '#eff6ff';
      case 'completed': return '#f0fdf4';
      case 'converted': return '#fefce8';
      case 'cancelled': return '#f9fafb';
      default: return '#f9fafb';
    }
  }

  getStepStatusIcon(status: string): string {
    switch (status) {
      case 'sent': return 'check_circle';
      case 'pending': return 'schedule';
      case 'failed': return 'error';
      case 'cancelled': return 'cancel';
      case 'skipped': return 'skip_next';
      default: return 'help';
    }
  }

  getStepStatusColor(status: string): string {
    switch (status) {
      case 'sent': return '#22c55e';
      case 'pending': return '#3b82f6';
      case 'failed': return '#ef4444';
      case 'cancelled': return '#6b7280';
      case 'skipped': return '#9ca3af';
      default: return '#9ca3af';
    }
  }

  formatRelativeTime(dateString: string | null): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMs < 0) {
      // Future date
      const absDiffMin = Math.abs(diffMin);
      const absDiffHr = Math.floor(absDiffMin / 60);
      if (absDiffMin < 60) return `in ${absDiffMin}m`;
      if (absDiffHr < 24) return `in ${absDiffHr}h`;
      return `in ${Math.floor(absDiffHr / 24)}d`;
    }

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  }

  formatDateTime(dateString: string | null): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  formatPhone(phone: string | null): string {
    return this.pipelineService.formatPhone(phone);
  }

  getTypeCount(type: string): number {
    if (!this.overview) return 0;
    if (type === 'all') return this.overview.instances.length;
    return this.overview.instances.filter(i => i.sequence_type === type).length;
  }

  getFunnelData(type: string): { started: number; completed: number; converted: number } {
    if (!this.overview?.stats[type]) return { started: 0, completed: 0, converted: 0 };
    const s = this.overview.stats[type];
    return {
      started: s.total,
      completed: s.completed + s.converted,
      converted: s.converted
    };
  }
}
