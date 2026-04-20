import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IncidentReport,
  IncidentService,
  IncidentStatus,
} from '../../../core/services/incident.service';

const TYPE_LABELS: Record<string, string> = {
  employee_injury: 'Employee injury',
  pet_injury: 'Pet injury',
  dog_bite: 'Dog bite / aggressive behavior',
  vehicle_accident: 'Vehicle accident',
  equipment_malfunction: 'Equipment malfunction',
  sanitation_issue: 'Sanitation issue',
  customer_complaint: 'Customer complaint',
  unsafe_environment: 'Unsafe environment',
  property_damage: 'Property damage',
  other: 'Other',
};

const FOLLOWUP_LABELS: Record<string, string> = {
  vet_followup: 'Veterinary follow-up',
  medical_followup: 'Medical follow-up',
  equipment_repair: 'Equipment repair',
  sanitation_completed: 'Sanitation completed',
  customer_followup: 'Customer follow-up',
  internal_review: 'Internal review',
};

@Component({
  selector: 'app-incident-details',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page" *ngIf="incident as i">
      <header>
        <button class="back" (click)="back()">← Back</button>
        <h1>Incident Report</h1>
        <span class="status status-{{ i.status }}">{{ i.status }}</span>
      </header>

      <section class="meta">
        <div><span class="k">When:</span> {{ i.incident_date }} {{ i.incident_time }}</div>
        <div><span class="k">Groomer:</span> {{ i.groomer?.first_name }} {{ i.groomer?.last_name }}</div>
        <div><span class="k">Location:</span> {{ i.location || '—' }}</div>
        <div *ngIf="i.booking_id">
          <span class="k">Booking:</span>
          <a [routerLink]="['/bookings', i.booking_id]">{{ i.booking_id.slice(0, 8) }}…</a>
        </div>
      </section>

      <section class="card">
        <h2>Type</h2>
        <span class="tag" *ngFor="let t of i.incident_types">{{ typeLabel(t) }}</span>
      </section>

      <section class="card">
        <h2>Description</h2>
        <p class="prose">{{ i.description }}</p>
      </section>

      <section class="card" *ngIf="i.pet_was_aggressive">
        <h2>Aggression</h2>
        <p class="prose">{{ i.aggression_description || 'No description provided.' }}</p>
      </section>

      <section class="card" *ngIf="i.injuries_occurred">
        <h2>Injuries</h2>
        <p class="prose">{{ i.injury_description || 'No description provided.' }}</p>
        <ul class="yn">
          <li *ngIf="i.first_aid_administered">✅ First aid administered</li>
          <li *ngIf="i.vet_care_required">🐾 Vet care required</li>
          <li *ngIf="i.employee_medical_care_required">🚑 Employee medical care required</li>
        </ul>
      </section>

      <section class="card">
        <h2>Actions taken</h2>
        <p class="prose">{{ i.actions_taken || '—' }}</p>
      </section>

      <section class="card">
        <h2>Notifications</h2>
        <ul class="yn">
          <li>
            Owner notified:
            <strong>{{ i.owner_notified ? 'Yes' : 'No' }}</strong>
            <span *ngIf="i.owner_notified_at"> at {{ i.owner_notified_at | date: 'short' }}</span>
          </li>
          <li>
            Management notified:
            <strong>{{ i.management_notified ? 'Yes' : 'No' }}</strong>
            <span *ngIf="i.management_notified_at"> at {{ i.management_notified_at | date: 'short' }}</span>
          </li>
        </ul>
      </section>

      <section class="card" *ngIf="i.follow_up_flags?.length">
        <h2>Follow-up</h2>
        <span class="tag" *ngFor="let f of i.follow_up_flags">{{ followUpLabel(f) }}</span>
        <p class="prose" *ngIf="i.follow_up_notes" style="margin-top: 0.75rem;">
          {{ i.follow_up_notes }}
        </p>
      </section>

      <section class="card" *ngIf="i.photo_urls?.length">
        <h2>Evidence photos</h2>
        <div class="photos">
          <a
            *ngFor="let p of i.photo_urls; let idx = index"
            (click)="openPhoto(p, $event)"
            href="#"
          >
            Photo {{ idx + 1 }}
          </a>
        </div>
        <p class="hint" *ngIf="i.security_recording_available">
          Security camera recording was available at the time of incident.
        </p>
      </section>

      <section class="card">
        <h2>Admin review</h2>
        <label>
          Status:
          <select [(ngModel)]="draftStatus">
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <textarea
          [(ngModel)]="draftNotes"
          rows="4"
          placeholder="Review notes…"
        ></textarea>
        <button class="save" (click)="save()" [disabled]="saving">
          {{ saving ? 'Saving…' : 'Save review' }}
        </button>
        <p class="hint" *ngIf="i.reviewed_at">
          Last reviewed {{ i.reviewed_at | date: 'short' }}
        </p>
      </section>
    </div>

    <div *ngIf="!incident && !error" class="state">Loading…</div>
    <div *ngIf="error" class="state error">{{ error }}</div>
  `,
  styles: [
    `
      .page {
        padding: 2rem;
        max-width: 960px;
        margin: 0 auto;
      }
      header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      header h1 {
        flex: 1;
        font-size: 1.5rem;
        margin: 0;
      }
      .back {
        background: none;
        border: 1px solid #cbd5e1;
        padding: 0.4rem 0.75rem;
        border-radius: 6px;
        cursor: pointer;
      }
      .meta {
        display: grid;
        gap: 0.5rem;
        background: #f1f5f9;
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }
      .k {
        color: #64748b;
        font-weight: 600;
        margin-right: 0.25rem;
      }
      .card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 1rem 1.25rem;
        margin-bottom: 1rem;
      }
      .card h2 {
        font-size: 0.95rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #475569;
        margin: 0 0 0.75rem;
      }
      .prose {
        white-space: pre-wrap;
        line-height: 1.5;
      }
      .yn {
        list-style: none;
        padding: 0;
        margin: 0.5rem 0 0;
      }
      .yn li {
        padding: 0.25rem 0;
      }
      .tag {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        background: #e0e7ff;
        color: #3730a3;
        font-size: 0.75rem;
        margin-right: 0.25rem;
      }
      .photos {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .photos a {
        padding: 0.35rem 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        color: #1e3a8a;
        text-decoration: none;
        font-size: 0.85rem;
      }
      .hint {
        font-size: 0.75rem;
        color: #64748b;
        margin-top: 0.5rem;
      }
      select,
      textarea {
        display: block;
        width: 100%;
        margin-top: 0.5rem;
        padding: 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
      }
      .save {
        margin-top: 0.75rem;
        padding: 0.5rem 1rem;
        background: #1e3a8a;
        color: white;
        border: 0;
        border-radius: 6px;
        cursor: pointer;
      }
      .save:disabled {
        opacity: 0.5;
      }
      .status {
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        font-size: 0.8rem;
        text-transform: capitalize;
      }
      .status-open {
        background: #dbeafe;
        color: #1e40af;
      }
      .status-acknowledged,
      .status-investigating {
        background: #fef3c7;
        color: #92400e;
      }
      .status-resolved {
        background: #dcfce7;
        color: #166534;
      }
      .status-closed {
        background: #e2e8f0;
        color: #475569;
      }
      .state {
        padding: 2rem;
        text-align: center;
        color: #64748b;
      }
      .state.error {
        color: #b91c1c;
      }
    `,
  ],
})
export class IncidentDetailsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private incidentService = inject(IncidentService);

  incident: IncidentReport | null = null;
  error: string | null = null;
  draftStatus: IncidentStatus = 'open';
  draftNotes: string = '';
  saving = false;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error = 'Missing incident id';
      return;
    }
    try {
      const i = await this.incidentService.getIncident(id);
      if (!i) {
        this.error = 'Incident not found';
        return;
      }
      this.incident = i;
      this.draftStatus = i.status;
      this.draftNotes = i.review_notes ?? '';
    } catch {
      this.error = 'Failed to load incident';
    }
  }

  back(): void {
    this.router.navigate(['/incidents']);
  }

  typeLabel(t: string): string {
    return TYPE_LABELS[t] ?? t;
  }

  followUpLabel(f: string): string {
    return FOLLOWUP_LABELS[f] ?? f;
  }

  async openPhoto(path: string, event: Event): Promise<void> {
    event.preventDefault();
    const url = await this.incidentService.signedPhotoUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async save(): Promise<void> {
    if (!this.incident) return;
    this.saving = true;
    const ok = await this.incidentService.updateStatus(
      this.incident.id,
      this.draftStatus,
      this.draftNotes.trim() || undefined
    );
    this.saving = false;
    if (ok && this.incident) {
      this.incident = {
        ...this.incident,
        status: this.draftStatus,
        review_notes: this.draftNotes,
      };
    }
  }
}
