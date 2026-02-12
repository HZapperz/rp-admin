import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { OptOut } from '../../models/pipeline.types';
import { SalesPipelineService } from '../../services/sales-pipeline.service';

@Component({
  selector: 'app-opt-outs-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './opt-outs-list.component.html',
  styleUrls: ['./opt-outs-list.component.scss']
})
export class OptOutsListComponent implements OnInit {
  optOuts: OptOut[] = [];
  isLoading = true;
  error: string | null = null;

  restoringPhone: string | null = null;

  constructor(
    private pipelineService: SalesPipelineService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadOptOuts();
  }

  loadOptOuts(): void {
    this.isLoading = true;
    this.error = null;

    this.pipelineService.getOptOuts().subscribe({
      next: (data) => {
        this.optOuts = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading opt-outs:', err);
        this.error = 'Failed to load opt-outs';
        this.isLoading = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/sales-pipeline']);
  }

  restoreOptIn(optOut: OptOut): void {
    if (this.restoringPhone) return;

    if (!confirm(`Are you sure you want to restore SMS for ${this.formatPhone(optOut.phone_number)}? This will allow messages to be sent to this number again.`)) {
      return;
    }

    this.restoringPhone = optOut.phone_number;

    this.pipelineService.restoreOptIn(optOut.phone_number).subscribe({
      next: (success) => {
        if (success) {
          this.optOuts = this.optOuts.filter(o => o.phone_number !== optOut.phone_number);
        } else {
          alert('Failed to restore opt-in. Please try again.');
        }
        this.restoringPhone = null;
      },
      error: () => {
        alert('Failed to restore opt-in. Please try again.');
        this.restoringPhone = null;
      }
    });
  }

  formatPhone(phone: string): string {
    return this.pipelineService.formatPhone(phone);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
}
