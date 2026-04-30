import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AllNotesService, NotePriority, NoteType, UnifiedNote } from '../../../core/services/all-notes.service';

type TypeFilter = 'all' | NoteType;
type PriorityFilter = 'all' | NotePriority;

@Component({
  selector: 'app-notes-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notes-list.component.html',
  styleUrls: ['./notes-list.component.scss'],
})
export class NotesListComponent implements OnInit {
  notes: UnifiedNote[] = [];
  filtered: UnifiedNote[] = [];
  isLoading = true;
  error: string | null = null;

  typeFilter: TypeFilter = 'all';
  priorityFilter: PriorityFilter = 'all';
  searchTerm = '';

  constructor(private notesService: AllNotesService, private router: Router) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      this.isLoading = true;
      this.error = null;
      this.notes = await this.notesService.getAllNotes();
      this.applyFilters();
    } catch (err) {
      console.error('Error loading notes:', err);
      this.error = 'Failed to load notes';
    } finally {
      this.isLoading = false;
    }
  }

  applyFilters() {
    let out = [...this.notes];

    if (this.typeFilter !== 'all') {
      out = out.filter(n => n.type === this.typeFilter);
    }

    if (this.priorityFilter !== 'all') {
      out = out.filter(n => n.type === 'admin' && n.priority === this.priorityFilter);
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase().trim();
      out = out.filter(n =>
        n.text?.toLowerCase().includes(term) ||
        n.clientName?.toLowerCase().includes(term) ||
        n.groomerName?.toLowerCase().includes(term) ||
        n.petName?.toLowerCase().includes(term) ||
        n.authorName?.toLowerCase().includes(term)
      );
    }

    this.filtered = out;
  }

  setTypeFilter(value: TypeFilter) {
    this.typeFilter = value;
    if (value !== 'admin' && value !== 'all') this.priorityFilter = 'all';
    this.applyFilters();
  }

  setPriorityFilter(value: PriorityFilter) {
    this.priorityFilter = value;
    this.applyFilters();
  }

  onSearchChange(event: Event) {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.applyFilters();
  }

  clearFilters() {
    this.typeFilter = 'all';
    this.priorityFilter = 'all';
    this.searchTerm = '';
    this.applyFilters();
  }

  // Counts for filter chips
  get totalCount() { return this.notes.length; }
  get adminCount() { return this.notes.filter(n => n.type === 'admin').length; }
  get groomerSessionCount() { return this.notes.filter(n => n.type === 'groomer_session').length; }
  get petBehaviorCount() { return this.notes.filter(n => n.type === 'pet_behavior').length; }

  get urgentAdminCount() { return this.notes.filter(n => n.type === 'admin' && n.priority === 'urgent').length; }
  get highAdminCount() { return this.notes.filter(n => n.type === 'admin' && n.priority === 'high').length; }

  // Display helpers
  typeLabel(type: NoteType): string {
    return {
      admin: 'Admin Note',
      groomer_session: 'Groomer Note',
      pet_behavior: 'Pet Behavior',
    }[type];
  }

  typeClass(type: NoteType): string {
    return `type-${type}`;
  }

  priorityClass(priority?: NotePriority): string {
    return priority ? `priority-${priority}` : '';
  }

  /** Navigate to the most useful source page for this note. */
  openSource(note: UnifiedNote) {
    if (note.bookingId) {
      this.router.navigate(['/bookings/details', note.bookingId]);
    } else if (note.clientId) {
      this.router.navigate(['/clients', note.clientId]);
    }
  }

  hasSourceLink(note: UnifiedNote): boolean {
    return !!(note.bookingId || note.clientId);
  }

  formatDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  formatBookingDate(iso?: string): string {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
  }

  timeAgo(iso?: string): string {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? '1 mo ago' : `${months} mo ago`;
  }

  trackById(_: number, note: UnifiedNote) { return note.id; }
}
