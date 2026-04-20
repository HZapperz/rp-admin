import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IncidentReport,
  IncidentService,
  IncidentStatus,
} from '../../../core/services/incident.service';

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  employee_injury: 'Employee injury',
  pet_injury: 'Pet injury',
  dog_bite: 'Dog bite',
  vehicle_accident: 'Vehicle accident',
  equipment_malfunction: 'Equipment malfunction',
  sanitation_issue: 'Sanitation issue',
  customer_complaint: 'Customer complaint',
  unsafe_environment: 'Unsafe environment',
  property_damage: 'Property damage',
  other: 'Other',
};

@Component({
  selector: 'app-incidents-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="incidents-page">
      <header class="page-header">
        <h1>🚨 Incident Reports</h1>
        <div class="filters">
          <label>
            Status:
            <select [(ngModel)]="selectedStatus" (change)="reload()">
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </div>
      </header>

      <div *ngIf="isLoading" class="state">Loading…</div>
      <div *ngIf="error" class="state error">{{ error }}</div>
      <div *ngIf="!isLoading && incidents.length === 0" class="state">
        No incidents match this filter.
      </div>

      <table *ngIf="!isLoading && incidents.length > 0" class="incidents-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Groomer</th>
            <th>Types</th>
            <th>Severity</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let i of incidents" (click)="openDetails(i.id)" class="row">
            <td>
              {{ i.incident_date }} {{ i.incident_time }}
              <div class="created">
                filed {{ i.created_at | date: 'short' }}
              </div>
            </td>
            <td>{{ i.groomer?.first_name }} {{ i.groomer?.last_name }}</td>
            <td>
              <span class="tag" *ngFor="let t of i.incident_types">{{
                typeLabel(t)
              }}</span>
            </td>
            <td>
              <span
                class="severity"
                [class.urgent]="isUrgent(i)"
                [class.high]="isHigh(i) && !isUrgent(i)"
              >
                {{ severity(i) }}
              </span>
            </td>
            <td>
              <span class="status status-{{ i.status }}">{{ i.status }}</span>
            </td>
            <td><button (click)="openDetails(i.id); $event.stopPropagation()">Open →</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [
    `
      .incidents-page {
        padding: 2rem;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
      }
      .page-header h1 {
        font-size: 1.75rem;
        margin: 0;
      }
      .filters label {
        font-size: 0.875rem;
        color: #475569;
      }
      .filters select {
        margin-left: 0.5rem;
        padding: 0.35rem 0.5rem;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
      }
      .state {
        padding: 2rem;
        text-align: center;
        color: #64748b;
        background: #f8fafc;
        border-radius: 8px;
      }
      .state.error {
        color: #b91c1c;
        background: #fef2f2;
      }
      .incidents-table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }
      .incidents-table th {
        background: #f1f5f9;
        color: #334155;
        text-align: left;
        padding: 0.75rem 1rem;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .incidents-table td {
        padding: 0.9rem 1rem;
        border-top: 1px solid #e2e8f0;
        vertical-align: top;
        font-size: 0.875rem;
      }
      .row {
        cursor: pointer;
      }
      .row:hover {
        background: #f8fafc;
      }
      .created {
        font-size: 0.75rem;
        color: #94a3b8;
      }
      .tag {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        background: #e0e7ff;
        color: #3730a3;
        font-size: 0.75rem;
        margin-right: 0.25rem;
        margin-bottom: 0.15rem;
      }
      .severity {
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        background: #e2e8f0;
        color: #334155;
      }
      .severity.high {
        background: #fef3c7;
        color: #92400e;
      }
      .severity.urgent {
        background: #fee2e2;
        color: #991b1b;
      }
      .status {
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
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
    `,
  ],
})
export class IncidentsListComponent implements OnInit {
  private incidentService = inject(IncidentService);
  private router = inject(Router);

  incidents: IncidentReport[] = [];
  selectedStatus: IncidentStatus | 'all' = 'open';
  isLoading = true;
  error: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    try {
      this.incidents = await this.incidentService.loadIncidents(this.selectedStatus);
    } catch {
      this.error = 'Failed to load incident reports';
    } finally {
      this.isLoading = false;
    }
  }

  typeLabel(t: string): string {
    return INCIDENT_TYPE_LABELS[t] ?? t;
  }

  isUrgent(i: IncidentReport): boolean {
    return (
      i.incident_types.includes('dog_bite') ||
      i.incident_types.includes('employee_injury') ||
      i.incident_types.includes('vehicle_accident') ||
      !!i.vet_care_required ||
      !!i.employee_medical_care_required
    );
  }

  isHigh(i: IncidentReport): boolean {
    return (
      i.incident_types.includes('pet_injury') ||
      i.incident_types.includes('unsafe_environment') ||
      i.incident_types.includes('customer_complaint')
    );
  }

  severity(i: IncidentReport): string {
    if (this.isUrgent(i)) return 'Urgent';
    if (this.isHigh(i)) return 'High';
    return 'Medium';
  }

  openDetails(id: string): void {
    this.router.navigate(['/incidents', id]);
  }
}
