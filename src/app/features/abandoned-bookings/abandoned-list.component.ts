import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import {
  SessionRecordingService,
  AbandonedBooking
} from '../../core/services/session-recording.service';

@Component({
  selector: 'app-abandoned-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './abandoned-list.component.html',
  styleUrl: './abandoned-list.component.scss'
})
export class AbandonedListComponent implements OnInit {
  bookings: AbandonedBooking[] = [];
  filteredBookings: AbandonedBooking[] = [];
  isLoading = true;

  stepFilter: string = 'all';
  dateFilter: string = 'all';

  stats = { total: 0, today: 0, withAccount: 0 };

  constructor(
    private sessionService: SessionRecordingService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading = true;
    this.sessionService.getAbandonedBookings(500).subscribe({
      next: (bookings) => {
        this.bookings = bookings;
        this.computeStats();
        this.applyFilters();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  private computeStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    this.stats = {
      total: this.bookings.length,
      today: this.bookings.filter(b => new Date(b.created_at).getTime() >= todayStart).length,
      withAccount: this.bookings.filter(b => b.user !== null).length,
    };
  }

  applyFilters() {
    let result = this.bookings;

    if (this.stepFilter !== 'all') {
      result = result.filter(b => {
        const step = b.last_step;
        if (this.stepFilter === 'info') {
          return step === 'info' || step === 'contact' || step === 'details';
        }
        return step === this.stepFilter;
      });
    }

    if (this.dateFilter !== 'all') {
      const now = new Date();
      let cutoff: Date;
      if (this.dateFilter === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (this.dateFilter === '7d') {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      result = result.filter(b => new Date(b.created_at) >= cutoff);
    }

    this.filteredBookings = result;
  }

  onFilterChange() {
    this.applyFilters();
  }

  // --- Helpers to parse session_data ---

  getName(b: AbandonedBooking): string {
    if (b.user?.first_name) return `${b.user.first_name} ${b.user.last_name || ''}`.trim();
    const s = b.session_data;
    if (s?.firstName) return `${s.firstName} ${s.lastName || ''}`.trim();
    return '-';
  }

  getPetNames(b: AbandonedBooking): string {
    const pets = b.session_data?.pets;
    if (!Array.isArray(pets) || pets.length === 0) return '-';
    return pets.map((p: any) => p.name).filter(Boolean).join(', ');
  }

  getPetCount(b: AbandonedBooking): number {
    return Array.isArray(b.session_data?.pets) ? b.session_data.pets.length : 0;
  }

  getServiceLabel(b: AbandonedBooking): string {
    const id = b.session_data?.serviceId;
    const map: Record<string, string> = {
      'royal-bath': 'Bath',
      'royal-groom': 'Groom',
      'royal-spa': 'Spa',
    };
    return map[id] || id || '-';
  }

  getStepLabel(step: string | null): string {
    const map: Record<string, string> = {
      'info': 'Contact Info',
      'customize': 'Customize',
      'schedule': 'Schedule',
      'checkout': 'Checkout',
      'contact': 'Contact Info',
      'details': 'Details',
    };
    return map[step || ''] || step || '-';
  }

  getStepIndex(step: string | null): number {
    const order: Record<string, number> = {
      'info': 1,
      'contact': 1,
      'details': 1,
      'customize': 2,
      'schedule': 3,
      'checkout': 4,
    };
    return order[step || ''] || 0;
  }

  getTimeAgo(dateStr: string): string {
    if (!dateStr) return '-';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  }

  getZip(b: AbandonedBooking): string {
    return b.session_data?.zipCode || '-';
  }

  getEstTotal(b: AbandonedBooking): number | null {
    const t = b.session_data?.total;
    return (t !== null && t !== undefined) ? t : null;
  }

  copyRecoveryLink(b: AbandonedBooking) {
    if (b.recovery_link) {
      navigator.clipboard.writeText(b.recovery_link);
    }
  }

  viewUserProfile(b: AbandonedBooking) {
    if (b.user?.id) {
      this.router.navigate(['/clients', b.user.id]);
    }
  }

  getIMessageUrl(b: AbandonedBooking): SafeUrl {
    if (!b.phone) return this.sanitizer.bypassSecurityTrustUrl('');

    const firstName = this.getName(b).split(' ')[0] || 'there';
    const petNames = this.getPetNames(b);
    const petDisplay = petNames && petNames !== '-' ? petNames : 'your pup';

    const message = `Hi ${firstName}! 🐾 This is Royal Pawz Mobile Dog Grooming. We saw you were interested in booking for ${petDisplay}. Is there something we can help with? We'd love to get them groomed! Let us know.`;

    return this.sanitizer.bypassSecurityTrustUrl(
      `sms:${b.phone}&body=${encodeURIComponent(message)}`
    );
  }

  getTotalAbandonedAmount(): number {
    return this.filteredBookings.reduce((sum, b) => {
      const total = this.getEstTotal(b);
      return sum + (total || 0);
    }, 0);
  }
}
