import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SalesPipelineService } from '../../services/sales-pipeline.service';
import {
  PipelineStats,
  PipelineNudge,
  PipelineLeadWithDetails,
  ACTIVE_STAGES,
  PIPELINE_STAGES,
  getStageConfig
} from '../../models/pipeline.types';

@Component({
  selector: 'app-pipeline-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pipeline-widget.component.html',
  styleUrls: ['./pipeline-widget.component.scss']
})
export class PipelineWidgetComponent implements OnInit {
  stats: PipelineStats | null = null;
  nudges: PipelineNudge[] = [];
  isLoading = true;

  // For funnel visualization
  funnelStages = ACTIVE_STAGES;
  maxStageCount = 1; // Avoid division by zero

  constructor(
    private pipelineService: SalesPipelineService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.pipelineService.getStats().subscribe({
      next: (stats) => {
        this.stats = stats;
        this.maxStageCount = Math.max(
          1,
          ...this.funnelStages.map(s => stats.by_stage[s] || 0)
        );
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });

    // Load leads to compute nudges
    this.pipelineService.getLeads().subscribe({
      next: (leads) => {
        this.nudges = this.pipelineService.getNudges(leads);
      }
    });
  }

  getStageLabel(stage: string): string {
    return getStageConfig(stage as any).label;
  }

  getStageColor(stage: string): string {
    return getStageConfig(stage as any).color;
  }

  getStageBgColor(stage: string): string {
    return getStageConfig(stage as any).bgColor;
  }

  getStageCount(stage: string): number {
    return this.stats?.by_stage[stage as keyof typeof this.stats.by_stage] || 0;
  }

  getBarWidth(stage: string): number {
    const count = this.getStageCount(stage);
    return Math.max(8, (count / this.maxStageCount) * 100);
  }

  get topNudge(): PipelineNudge | null {
    return this.nudges[0] || null;
  }

  goToPipeline(): void {
    this.router.navigate(['/sales-pipeline']);
  }
}
