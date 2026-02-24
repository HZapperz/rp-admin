import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  PipelineLeadWithDetails,
  PipelineStage,
  PipelineStats,
  PipelineFilters,
  PipelineNudge,
  PIPELINE_STAGES,
  ACTIVE_STAGES,
  END_STAGES,
  StageConfig,
  PRIORITY_THRESHOLDS
} from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';
import { ComposeSmsComponent } from '../compose-sms/compose-sms.component';
import { BulkSmsComponent } from '../bulk-sms/bulk-sms.component';

@Component({
  selector: 'app-pipeline-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ComposeSmsComponent,
    BulkSmsComponent
  ],
  templateUrl: './pipeline-board.component.html',
  styleUrls: ['./pipeline-board.component.scss']
})
export class PipelineBoardComponent implements OnInit, OnDestroy {
  // Data
  leadsByStage: Record<PipelineStage, PipelineLeadWithDetails[]> = {
    'NEW': [],
    'TEXTED': [],
    'NO_RESPONSE': [],
    'NEEDS_CALL': [],
    'CALLED': [],
    'BOOKED': [],
    'CONVERTED': [],
    'LOST': [],
    'DORMANT': []
  };
  allLeads: PipelineLeadWithDetails[] = [];
  stats: PipelineStats | null = null;
  nudges: PipelineNudge[] = [];

  // UI State
  isLoading = true;
  error: string | null = null;
  searchTerm = '';
  priorityFilter: 'all' | 'high' | 'medium' | 'low' = 'all';
  dismissedNudges: Set<string> = new Set();

  // Tab + Table State
  selectedStage: PipelineStage = 'NEW';
  sortColumn: 'name' | 'priority_score' | 'days_in_stage' = 'priority_score';
  sortDirection: 'asc' | 'desc' = 'desc';
  activeMoveMenuLeadId: string | null = null;

  // SMS Modal State
  showSmsModal = false;
  selectedLeadForSms: PipelineLeadWithDetails | null = null;

  // Bulk SMS Modal State
  showBulkSmsModal = false;
  selectedLeads: Set<string> = new Set();
  selectionMode = false;

  // Stage configuration
  stages: StageConfig[] = PIPELINE_STAGES;
  activeStages = PIPELINE_STAGES.filter(s => ACTIVE_STAGES.includes(s.stage));
  endStages = PIPELINE_STAGES.filter(s => END_STAGES.includes(s.stage));

  private destroy$ = new Subject<void>();

  constructor(
    private pipelineService: SalesPipelineService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.pipelineService.runAutomationCheck().subscribe();

    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.refreshData();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Close move menu on outside click
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.activeMoveMenuLeadId) {
      const target = event.target as HTMLElement;
      if (!target.closest('.move-menu') && !target.closest('.move-trigger')) {
        this.activeMoveMenuLeadId = null;
      }
    }
  }

  loadData(): void {
    this.isLoading = true;
    this.error = null;

    const filters: PipelineFilters = {};
    if (this.searchTerm) {
      filters.searchTerm = this.searchTerm;
    }
    if (this.priorityFilter !== 'all') {
      filters.priorityLevel = this.priorityFilter;
    }

    this.pipelineService.getLeadsByStage(filters).subscribe({
      next: (data) => {
        this.leadsByStage = data;
        this.allLeads = Object.values(data).flat();
        this.nudges = this.pipelineService.getNudges(this.allLeads);
        // Auto-select first tab with leads if current tab is empty
        if ((data[this.selectedStage] || []).length === 0) {
          const allStages = [...this.activeStages, ...this.endStages];
          const firstWithLeads = allStages.find(s => (data[s.stage] || []).length > 0);
          if (firstWithLeads) {
            this.selectedStage = firstWithLeads.stage;
          }
        }
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading pipeline:', err);
        this.error = 'Failed to load pipeline data';
        this.isLoading = false;
      }
    });

    this.pipelineService.getStats().subscribe({
      next: (stats) => {
        this.stats = stats;
      }
    });
  }

  refreshData(): void {
    if (!this.isLoading) {
      const filters: PipelineFilters = {};
      if (this.searchTerm) {
        filters.searchTerm = this.searchTerm;
      }
      if (this.priorityFilter !== 'all') {
        filters.priorityLevel = this.priorityFilter;
      }

      this.pipelineService.getLeadsByStage(filters).subscribe({
        next: (data) => {
          this.leadsByStage = data;
          this.allLeads = Object.values(data).flat();
          this.nudges = this.pipelineService.getNudges(this.allLeads);
        }
      });

      this.pipelineService.getStats().subscribe({
        next: (stats) => {
          this.stats = stats;
        }
      });
    }
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.loadData();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.loadData();
  }

  onPriorityFilterChange(level: 'all' | 'high' | 'medium' | 'low'): void {
    this.priorityFilter = level;
    this.loadData();
  }

  dismissNudge(nudge: PipelineNudge): void {
    this.dismissedNudges.add(nudge.message);
  }

  get visibleNudges(): PipelineNudge[] {
    return this.nudges.filter(n => !this.dismissedNudges.has(n.message));
  }

  // ==================== TAB + TABLE ====================

  selectStage(stage: PipelineStage): void {
    this.selectedStage = stage;
    this.activeMoveMenuLeadId = null;
    // Don't clear selection — allow cross-stage bulk select
  }

  get currentStageConfig(): StageConfig {
    return this.stages.find(s => s.stage === this.selectedStage) || this.stages[0];
  }

  get currentStageLeads(): PipelineLeadWithDetails[] {
    return this.sortLeads(this.leadsByStage[this.selectedStage] || []);
  }

  onSort(column: 'name' | 'priority_score' | 'days_in_stage'): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'name' ? 'asc' : 'desc';
    }
  }

  sortLeads(leads: PipelineLeadWithDetails[]): PipelineLeadWithDetails[] {
    const sorted = [...leads];
    const dir = this.sortDirection === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (this.sortColumn) {
        case 'name':
          const nameA = `${a.user.first_name} ${a.user.last_name}`.toLowerCase();
          const nameB = `${b.user.first_name} ${b.user.last_name}`.toLowerCase();
          return nameA.localeCompare(nameB) * dir;
        case 'priority_score':
          return (a.priority_score - b.priority_score) * dir;
        case 'days_in_stage':
          return (a.days_in_stage - b.days_in_stage) * dir;
        default:
          return 0;
      }
    });

    return sorted;
  }

  selectAllCurrentStage(): void {
    this.leadsByStage[this.selectedStage].forEach(lead => {
      this.selectedLeads.add(lead.id);
    });
  }

  deselectAllCurrentStage(): void {
    this.leadsByStage[this.selectedStage].forEach(lead => {
      this.selectedLeads.delete(lead.id);
    });
  }

  get allCurrentSelected(): boolean {
    const stageLeads = this.leadsByStage[this.selectedStage];
    if (stageLeads.length === 0) return false;
    return stageLeads.every(lead => this.selectedLeads.has(lead.id));
  }

  toggleSelectAll(): void {
    if (this.allCurrentSelected) {
      this.deselectAllCurrentStage();
    } else {
      this.selectAllCurrentStage();
    }
  }

  // ==================== TABLE HELPERS ====================

  getPriorityColor(score: number): string {
    if (score >= PRIORITY_THRESHOLDS.high) return '#22c55e';
    if (score >= PRIORITY_THRESHOLDS.medium) return '#eab308';
    return '#ef4444';
  }

  getPriorityBg(score: number): string {
    if (score >= PRIORITY_THRESHOLDS.high) return '#f0fdf4';
    if (score >= PRIORITY_THRESHOLDS.medium) return '#fefce8';
    return '#fef2f2';
  }

  formatPhone(phone: string | null): string {
    return this.pipelineService.formatPhone(phone);
  }

  getPetSummary(lead: PipelineLeadWithDetails): string {
    if (!lead.pets || lead.pets.length === 0) return 'No pets';
    if (lead.pets.length === 1) return lead.pets[0].name;
    return `${lead.pets[0].name} +${lead.pets.length - 1}`;
  }

  toggleRowMoveMenu(leadId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.activeMoveMenuLeadId = this.activeMoveMenuLeadId === leadId ? null : leadId;
  }

  moveLeadFromRow(lead: PipelineLeadWithDetails, newStage: PipelineStage): void {
    this.activeMoveMenuLeadId = null;
    this.onMoveToStage({ lead, stage: newStage });
  }

  getAvailableStages(currentStage: PipelineStage): StageConfig[] {
    return this.stages.filter(s => s.stage !== currentStage);
  }

  // ==================== ACTIONS ====================

  onViewLead(userId: string): void {
    this.router.navigate(['/clients', userId]);
  }

  onSendSms(lead: PipelineLeadWithDetails): void {
    this.selectedLeadForSms = lead;
    this.showSmsModal = true;
  }

  closeSmsModal(): void {
    this.showSmsModal = false;
    this.selectedLeadForSms = null;
  }

  onSmsSent(): void {
    this.closeSmsModal();
    this.refreshData();
  }

  onMakeCall(lead: PipelineLeadWithDetails): void {
    const updates: any = {
      last_call_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString()
    };

    if (['NEEDS_CALL', 'NO_RESPONSE'].includes(lead.pipeline_stage)) {
      updates.pipeline_stage = 'CALLED';
    }

    this.pipelineService.updateLead(lead.id, updates).subscribe({
      next: () => {
        this.pipelineService.logActivity(lead.id, lead.user_id, 'CALLED').subscribe();
        this.refreshData();
      }
    });
  }

  getIMessageUrl(lead: PipelineLeadWithDetails): SafeUrl {
    if (!lead.user.phone) return this.sanitizer.bypassSecurityTrustUrl('');

    const firstName = lead.user.first_name || '';
    const petName = lead.pets?.[0]?.name || 'your pup';
    const allPetNames = lead.pets?.length > 1
      ? lead.pets.map(p => p.name).join(' & ')
      : petName;

    const message = `Hi ${firstName}! This is Royal Pawz Mobile Dog Grooming 🐾 We saw you signed up and we'd love to get ${allPetNames} pampered! Want to book a grooming? Just reply here or visit royalpawzusa.com`;

    return this.sanitizer.bypassSecurityTrustUrl(
      `sms:${lead.user.phone}&body=${encodeURIComponent(message)}`
    );
  }

  getCallUrl(lead: PipelineLeadWithDetails): SafeUrl {
    if (!lead.user.phone) return this.sanitizer.bypassSecurityTrustUrl('');
    return this.sanitizer.bypassSecurityTrustUrl(`tel:${lead.user.phone}`);
  }

  onMoveToStage(event: { lead: PipelineLeadWithDetails; stage: PipelineStage }): void {
    const currentLeads = this.leadsByStage[event.lead.pipeline_stage];
    const index = currentLeads.findIndex(l => l.id === event.lead.id);
    if (index > -1) {
      currentLeads.splice(index, 1);
    }

    event.lead.pipeline_stage = event.stage;
    this.leadsByStage[event.stage].unshift(event.lead);

    this.pipelineService.moveToStage(event.lead.id, event.stage).subscribe({
      next: () => {
        this.pipelineService.getStats().subscribe(stats => this.stats = stats);
      },
      error: () => {
        this.loadData();
      }
    });
  }

  // ==================== SELECTION & BULK ====================

  toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    if (!this.selectionMode) {
      this.selectedLeads.clear();
    }
  }

  toggleLeadSelection(leadId: string): void {
    if (this.selectedLeads.has(leadId)) {
      this.selectedLeads.delete(leadId);
    } else {
      this.selectedLeads.add(leadId);
    }
  }

  openBulkSms(): void {
    if (this.selectedLeads.size === 0) return;
    this.showBulkSmsModal = true;
  }

  closeBulkSmsModal(): void {
    this.showBulkSmsModal = false;
  }

  onBulkSmsSent(): void {
    this.closeBulkSmsModal();
    this.selectedLeads.clear();
    this.selectionMode = false;
    this.refreshData();
  }

  goToOptOuts(): void {
    this.router.navigate(['/sales-pipeline/opt-outs']);
  }

  getSelectedLeadsArray(): PipelineLeadWithDetails[] {
    const leads: PipelineLeadWithDetails[] = [];
    for (const stage of this.stages) {
      for (const lead of this.leadsByStage[stage.stage]) {
        if (this.selectedLeads.has(lead.id)) {
          leads.push(lead);
        }
      }
    }
    return leads;
  }

  formatStageDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }
}
