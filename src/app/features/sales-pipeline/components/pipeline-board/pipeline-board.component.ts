import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DragDropModule } from '@angular/cdk/drag-drop';
import {
  PipelineLeadWithDetails,
  PipelineStage,
  PipelineStats,
  PipelineFilters,
  PIPELINE_STAGES,
  StageConfig
} from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';
import { StageColumnComponent } from '../stage-column/stage-column.component';
import { ComposeSmsComponent } from '../compose-sms/compose-sms.component';
import { BulkSmsComponent } from '../bulk-sms/bulk-sms.component';

@Component({
  selector: 'app-pipeline-board',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    StageColumnComponent,
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
    'CONVERTED': [],
    'LOST': []
  };
  stats: PipelineStats | null = null;

  // UI State
  isLoading = true;
  error: string | null = null;
  searchTerm = '';
  showConvertedLost = false;

  // SMS Modal State
  showSmsModal = false;
  selectedLeadForSms: PipelineLeadWithDetails | null = null;

  // Bulk SMS Modal State
  showBulkSmsModal = false;
  selectedLeads: Set<string> = new Set();
  selectionMode = false;

  // Stage configuration
  stages: StageConfig[] = PIPELINE_STAGES;
  activeStages = PIPELINE_STAGES.filter(s => !['CONVERTED', 'LOST'].includes(s.stage));
  endStages = PIPELINE_STAGES.filter(s => ['CONVERTED', 'LOST'].includes(s.stage));

  // Drag and drop
  dropListIds: string[] = [];
  connectedDropLists: Record<string, string[]> = {};

  private destroy$ = new Subject<void>();

  constructor(
    private pipelineService: SalesPipelineService,
    private router: Router
  ) {
    // Initialize drop list IDs and connections
    this.stages.forEach(stage => {
      const id = `stage-${stage.stage}`;
      this.dropListIds.push(id);
    });

    // All columns can drop to all others
    this.stages.forEach(stage => {
      this.connectedDropLists[stage.stage] = this.dropListIds.filter(id => id !== `stage-${stage.stage}`);
    });
  }

  ngOnInit(): void {
    this.loadData();

    // Auto-refresh every 30 seconds
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

  loadData(): void {
    this.isLoading = true;
    this.error = null;

    const filters: PipelineFilters = {};
    if (this.searchTerm) {
      filters.searchTerm = this.searchTerm;
    }

    this.pipelineService.getLeadsByStage(filters).subscribe({
      next: (data) => {
        this.leadsByStage = data;
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

      this.pipelineService.getLeadsByStage(filters).subscribe({
        next: (data) => {
          this.leadsByStage = data;
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

  toggleConvertedLost(): void {
    this.showConvertedLost = !this.showConvertedLost;
  }

  // Drag and Drop
  onLeadDropped(event: {
    lead: PipelineLeadWithDetails;
    fromStage: PipelineStage;
    toStage: PipelineStage;
    previousIndex: number;
    currentIndex: number;
  }): void {
    // Optimistically update UI (already done by CDK)
    // Now persist to database
    this.pipelineService.moveToStage(event.lead.id, event.toStage).subscribe({
      next: () => {
        // Refresh stats
        this.pipelineService.getStats().subscribe(stats => this.stats = stats);
      },
      error: (err) => {
        console.error('Error moving lead:', err);
        // Revert UI change
        this.loadData();
      }
    });
  }

  // Navigation
  onViewLead(leadId: string): void {
    this.router.navigate(['/sales-pipeline/lead', leadId]);
  }

  // SMS
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

  // Call tracking
  onMakeCall(lead: PipelineLeadWithDetails): void {
    // Update last_call_at and potentially move to CALLED stage
    const updates: any = {
      last_call_at: new Date().toISOString()
    };

    if (['NEEDS_CALL', 'NO_RESPONSE'].includes(lead.pipeline_stage)) {
      updates.pipeline_stage = 'CALLED';
    }

    this.pipelineService.updateLead(lead.id, updates).subscribe({
      next: () => {
        this.refreshData();
      }
    });
  }

  // Move via menu
  onMoveToStage(event: { lead: PipelineLeadWithDetails; stage: PipelineStage }): void {
    // Remove from current stage
    const currentLeads = this.leadsByStage[event.lead.pipeline_stage];
    const index = currentLeads.findIndex(l => l.id === event.lead.id);
    if (index > -1) {
      currentLeads.splice(index, 1);
    }

    // Add to new stage
    event.lead.pipeline_stage = event.stage;
    this.leadsByStage[event.stage].unshift(event.lead);

    // Persist
    this.pipelineService.moveToStage(event.lead.id, event.stage).subscribe({
      next: () => {
        this.pipelineService.getStats().subscribe(stats => this.stats = stats);
      },
      error: () => {
        this.loadData();
      }
    });
  }

  // Selection for bulk actions
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

  selectAllInStage(stage: PipelineStage): void {
    this.leadsByStage[stage].forEach(lead => {
      this.selectedLeads.add(lead.id);
    });
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

  // Opt-outs navigation
  goToOptOuts(): void {
    this.router.navigate(['/sales-pipeline/opt-outs']);
  }

  // Data migration (one-time)
  runMigration(): void {
    if (confirm('This will populate the pipeline from existing warm leads. Continue?')) {
      this.pipelineService.migrateWarmLeads().subscribe({
        next: (results) => {
          const success = results.filter((r: any) => r.success).length;
          alert(`Migration complete! ${success} leads added to pipeline.`);
          this.loadData();
        },
        error: (err) => {
          console.error('Migration error:', err);
          alert('Migration failed. Check console for details.');
        }
      });
    }
  }

  // Helper methods
  getDropListId(stage: PipelineStage): string {
    return `stage-${stage}`;
  }

  getConnectedLists(stage: PipelineStage): string[] {
    return this.connectedDropLists[stage];
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
}
