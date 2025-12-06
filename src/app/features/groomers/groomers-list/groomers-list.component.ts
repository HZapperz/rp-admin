import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GroomerService, GroomerWithStats } from '../../../core/services/groomer.service';

@Component({
  selector: 'app-groomers-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './groomers-list.component.html',
  styleUrl: './groomers-list.component.scss'
})
export class GroomersListComponent implements OnInit {
  groomers: GroomerWithStats[] = [];
  isLoading = true;
  searchTerm = '';

  constructor(
    private groomerService: GroomerService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadGroomers();
  }

  loadGroomers() {
    // Use new API endpoint with commission data
    this.groomerService.getAllGroomersWithCommission().subscribe({
      next: (groomers) => {
        this.groomers = groomers;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading groomers:', err);
        this.isLoading = false;
      }
    });
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
