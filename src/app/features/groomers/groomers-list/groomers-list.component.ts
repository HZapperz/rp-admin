import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  GroomerService,
  GroomerWithStats,
} from '../../../core/services/groomer.service';

@Component({
  selector: 'app-groomers-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './groomers-list.component.html',
  styleUrls: ['./groomers-list.component.scss'],
})
export class GroomersListComponent implements OnInit {
  groomers: GroomerWithStats[] = [];
  isLoading = true;
  searchTerm = '';
  failedAvatars = new Set<string>();
  expandedCards: Set<string> = new Set();

  constructor(private groomerService: GroomerService, private router: Router) {}

  ngOnInit() {
    this.loadGroomers();
  }

  loadGroomers() {
    // Use new API endpoint with commission data
    this.groomerService.getAllGroomersWithCommission().subscribe({
      next: (groomers) => {
        this.groomers = groomers;
        this.isLoading = false;
        // Reset failed avatars when loading new groomers
        this.failedAvatars.clear();
      },
      error: (err) => {
        console.error('Error loading groomers:', err);
        this.isLoading = false;
      },
    });
  }

  onAvatarError(groomerId: string) {
    this.failedAvatars.add(groomerId);
  }

  hasAvatarFailed(groomerId: string): boolean {
    return this.failedAvatars.has(groomerId);
  }

  toggleCard(groomerId: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedCards.has(groomerId)) {
      this.expandedCards.delete(groomerId);
    } else {
      this.expandedCards.add(groomerId);
    }
  }

  isCardExpanded(groomerId: string): boolean {
    return this.expandedCards.has(groomerId);
  }

  getInitials(firstName: string, lastName: string): string {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }

  onSearch(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.isLoading = true;
    // For now, filter client-side. Could implement server-side search later
    this.loadGroomers();
  }

  viewGroomer(groomerId: string) {
    this.router.navigate(['/groomers', groomerId]);
  }

  formatCommissionRate(rate: number): string {
    return this.groomerService.formatCommissionRate(rate);
  }

  formatCurrency(amount: number): string {
    return this.groomerService.formatCurrency(amount);
  }
}
