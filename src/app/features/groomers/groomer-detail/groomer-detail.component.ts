import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GroomerService, GroomerEarningsDetail, CommissionHistory } from '../../../core/services/groomer.service';

@Component({
  selector: 'app-groomer-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './groomer-detail.component.html',
  styleUrls: ['./groomer-detail.component.scss']
})
export class GroomerDetailComponent implements OnInit {
  groomerId!: string;
  earningsDetail: GroomerEarningsDetail | null = null;
  commissionHistory: CommissionHistory[] = [];
  isLoading = true;

  editingCommission = false;
  newCommissionPercent = 35;
  commissionNotes = '';
  isSaving = false;
  saveError = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private groomerService: GroomerService
  ) {}

  ngOnInit() {
    this.groomerId = this.route.snapshot.paramMap.get('id') || '';
    this.loadGroomerData();
  }

  loadGroomerData() {
    this.isLoading = true;

    // Load earnings details
    this.groomerService.getGroomerEarnings(this.groomerId).subscribe({
      next: (data) => {
        this.earningsDetail = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading groomer earnings:', err);
        this.isLoading = false;
      }
    });

    // Load commission history
    this.groomerService.getCommissionHistory(this.groomerId).subscribe({
      next: (data) => {
        this.commissionHistory = data.history;
      },
      error: (err) => {
        console.error('Error loading commission history:', err);
      }
    });
  }

  startEditCommission() {
    this.editingCommission = true;
    this.newCommissionPercent = Math.round((this.earningsDetail?.groomer.commissionRate || 0.35) * 100);
    this.commissionNotes = '';
    this.saveError = '';
  }

  cancelEditCommission() {
    this.editingCommission = false;
    this.saveError = '';
  }

  saveCommission() {
    if (this.newCommissionPercent < 0 || this.newCommissionPercent > 100) {
      this.saveError = 'Commission rate must be between 0 and 100';
      return;
    }

    this.isSaving = true;
    this.saveError = '';

    const commissionRate = this.newCommissionPercent / 100;

    this.groomerService.updateGroomerCommission(
      this.groomerId,
      commissionRate,
      this.commissionNotes || undefined
    ).subscribe({
      next: () => {
        this.isSaving = false;
        this.editingCommission = false;
        // Show success message
        alert('Commission rate updated successfully!');
        // Reload data to show updated values
        this.loadGroomerData();
      },
      error: (err) => {
        console.error('Error updating commission:', err);

        // Provide more helpful error messages
        if (err.message?.includes('lock') || err.message?.includes('LockManager')) {
          this.saveError = 'Auth session conflict detected. Please close any other admin portal tabs and try again.';
        } else if (err.error?.error) {
          this.saveError = err.error.error;
        } else if (err.message) {
          this.saveError = err.message;
        } else {
          this.saveError = 'Failed to update commission rate. Please try again.';
        }

        this.isSaving = false;
      }
    });
  }

  goBack() {
    this.router.navigate(['/groomers']);
  }

  formatCommissionRate(rate: number): string {
    return this.groomerService.formatCommissionRate(rate);
  }

  formatCurrency(amount: number): string {
    return this.groomerService.formatCurrency(amount);
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
