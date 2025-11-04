import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PromotionService } from '../../../core/services/promotion.service';
import { Promotion } from '../../../core/models/types';
import { PromotionFormDialogComponent } from '../promotion-form-dialog/promotion-form-dialog.component';

@Component({
  selector: 'app-promotions-list',
  standalone: true,
  imports: [CommonModule, FormsModule, PromotionFormDialogComponent],
  templateUrl: './promotions-list.component.html',
  styleUrls: ['./promotions-list.component.scss']
})
export class PromotionsListComponent implements OnInit {
  promotions: Promotion[] = [];
  filteredPromotions: Promotion[] = [];
  isLoading = true;
  error: string | null = null;

  selectedStatus: string = 'all';
  searchTerm: string = '';

  // Dialog state
  showPromotionDialog = false;
  editingPromotion: Promotion | null = null;

  constructor(private promotionService: PromotionService) {}

  ngOnInit() {
    this.loadPromotions();
  }

  loadPromotions() {
    this.isLoading = true;
    this.promotionService.getAllPromotions().subscribe({
      next: (promotions) => {
        this.promotions = promotions;
        this.applyFilters();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading promotions:', err);
        this.error = 'Failed to load promotions';
        this.isLoading = false;
      }
    });
  }

  applyFilters() {
    let filtered = [...this.promotions];

    // Filter by status
    if (this.selectedStatus !== 'all') {
      filtered = filtered.filter(p => {
        const status = this.getPromotionStatus(p);
        return status === this.selectedStatus;
      });
    }

    // Filter by search term
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.title?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
      );
    }

    this.filteredPromotions = filtered;
  }

  onStatusFilterChange(event: Event) {
    this.selectedStatus = (event.target as HTMLSelectElement).value;
    this.applyFilters();
  }

  onSearchChange(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilters();
  }

  getPromotionStatus(promotion: Promotion): 'active' | 'inactive' | 'expired' | 'scheduled' | 'maxed_out' {
    return this.promotionService.getPromotionStatus(promotion);
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'active': 'status-active',
      'inactive': 'status-inactive',
      'expired': 'status-expired',
      'scheduled': 'status-scheduled',
      'maxed_out': 'status-maxed'
    };
    return classes[status] || '';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'active': 'Active',
      'inactive': 'Inactive',
      'expired': 'Expired',
      'scheduled': 'Scheduled',
      'maxed_out': 'Max Reached'
    };
    return labels[status] || status;
  }

  openCreateDialog() {
    this.editingPromotion = null;
    this.showPromotionDialog = true;
  }

  openEditDialog(promotion: Promotion) {
    this.editingPromotion = promotion;
    this.showPromotionDialog = true;
  }

  closeDialog() {
    this.showPromotionDialog = false;
    this.editingPromotion = null;
  }

  async togglePromotionStatus(promotion: Promotion, event: Event) {
    event.stopPropagation();

    const newStatus = !promotion.is_active;
    this.promotionService.togglePromotionStatus(promotion.id, newStatus).subscribe({
      next: (success) => {
        if (success) {
          promotion.is_active = newStatus;
          this.applyFilters();
        } else {
          alert('Failed to update promotion status');
        }
      },
      error: (err) => {
        console.error('Error updating promotion:', err);
        alert('Failed to update promotion status');
      }
    });
  }

  async deletePromotion(promotion: Promotion, event: Event) {
    event.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${promotion.title}"? This action cannot be undone.`)) {
      return;
    }

    this.promotionService.deletePromotion(promotion.id).subscribe({
      next: (success) => {
        if (success) {
          this.loadPromotions();
        } else {
          alert('Failed to delete promotion. It may have been used in bookings.');
        }
      },
      error: (err) => {
        console.error('Error deleting promotion:', err);
        alert('Failed to delete promotion. It may have been used in bookings.');
      }
    });
  }

  onPromotionSaved() {
    this.closeDialog();
    this.loadPromotions();
  }

  formatDate(dateString: string): string {
    return this.promotionService.formatDate(dateString);
  }

  formatDateRange(validFrom: string, validUntil: string): string {
    return this.promotionService.formatDateRange(validFrom, validUntil);
  }

  getDaysRemaining(validUntil: string): number {
    return this.promotionService.getDaysRemaining(validUntil);
  }

  getUsagePercentage(promotion: Promotion): number {
    if (!promotion.max_uses) return 0;
    return (promotion.current_uses / promotion.max_uses) * 100;
  }

  getUsageLabel(promotion: Promotion): string {
    if (!promotion.max_uses) return `${promotion.current_uses} uses`;
    return `${promotion.current_uses} / ${promotion.max_uses} uses`;
  }
}
