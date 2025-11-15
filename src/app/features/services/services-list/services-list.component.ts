import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../../environments/environment';

interface ServicePackage {
  id: string;
  service_id: string;
  name: string;
  description: string;
  duration: number;
  price_small: number;
  price_medium: number;
  price_large: number;
  price_xl: number;
  includes: string[];
  icon: string;
  package_type: 'basic' | 'premium' | 'deluxe';
  is_popular: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-services-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './services-list.component.html',
  styleUrls: ['./services-list.component.scss'],
})
export class ServicesListComponent implements OnInit {
  packages: ServicePackage[] = [];
  loading = false;
  displayedColumns: string[] = [
    'icon',
    'name',
    'package_type',
    'pricing',
    'duration',
    'status',
    'actions',
  ];

  constructor(
    private http: HttpClient,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadPackages();
  }

  loadPackages(): void {
    this.loading = true;
    this.http
      .get<{ success: boolean; data: ServicePackage[] }>(
        `${environment.apiUrl}/api/admin/service-packages`
      )
      .subscribe({
        next: (response) => {
          this.packages = response.data;
          this.loading = false;
        },
        error: (error) => {
          console.error('Error loading packages:', error);
          this.snackBar.open('Failed to load service packages', 'Close', {
            duration: 3000,
          });
          this.loading = false;
        },
      });
  }

  toggleStatus(pkg: ServicePackage): void {
    const newStatus = !pkg.is_active;
    this.http
      .put<{ success: boolean; data: ServicePackage }>(
        `${environment.apiUrl}/api/admin/service-packages/${pkg.id}`,
        {
          is_active: newStatus,
        }
      )
      .subscribe({
        next: () => {
          pkg.is_active = newStatus;
          this.snackBar.open(
            `Package ${newStatus ? 'activated' : 'deactivated'} successfully`,
            'Close',
            { duration: 3000 }
          );
        },
        error: (error) => {
          console.error('Error updating package status:', error);
          this.snackBar.open('Failed to update package status', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  editPackage(pkg: ServicePackage): void {
    // TODO: Open edit dialog
    this.snackBar.open('Edit functionality coming soon', 'Close', {
      duration: 2000,
    });
  }

  deletePackage(pkg: ServicePackage): void {
    if (
      !confirm(
        `Are you sure you want to deactivate "${pkg.name}"? This will hide it from clients.`
      )
    ) {
      return;
    }

    this.http
      .delete(`${environment.apiUrl}/api/admin/service-packages/${pkg.id}`)
      .subscribe({
        next: () => {
          pkg.is_active = false;
          this.snackBar.open('Package deactivated successfully', 'Close', {
            duration: 3000,
          });
          this.loadPackages();
        },
        error: (error) => {
          console.error('Error deleting package:', error);
          this.snackBar.open('Failed to deactivate package', 'Close', {
            duration: 3000,
          });
        },
      });
  }

  addPackage(): void {
    // TODO: Open add dialog
    this.snackBar.open('Add functionality coming soon', 'Close', {
      duration: 2000,
    });
  }

  formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
  }

  getPackageTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      basic: 'Royal Bath',
      premium: 'Royal Groom',
      deluxe: 'Royal Spa',
    };
    return labels[type] || type;
  }

  getPackageTypeColor(type: string): string {
    const colors: Record<string, string> = {
      basic: 'badge-info',
      premium: 'badge-primary',
      deluxe: 'badge-accent',
    };
    return colors[type] || 'badge-default';
  }
}
