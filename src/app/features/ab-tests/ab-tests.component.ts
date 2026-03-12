import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';

interface FunnelStep {
  event: string;
  label: string;
}

interface VariantData {
  [event: string]: number;
}

interface TestResult {
  testName: string;
  period: string;
  variantA: VariantData;
  variantB: VariantData;
  totalA: number;
  totalB: number;
}

const FUNNEL_STEPS: FunnelStep[] = [
  { event: 'entered',       label: 'Entered /book' },
  { event: 'intro_started', label: 'Started Intro (A only)' },
  { event: 'zip_submitted', label: 'Submitted ZIP' },
  { event: 'pets_reached',  label: 'Reached Pets' },
  { event: 'contact_reached', label: 'Reached Contact' },
  { event: 'converted',     label: 'Converted' },
];

type Period = '7d' | '30d' | 'all';

@Component({
  selector: 'app-ab-tests',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ab-tests.component.html',
  styleUrls: ['./ab-tests.component.scss']
})
export class AbTestsComponent implements OnInit {
  result: TestResult | null = null;
  isLoading = true;
  selectedPeriod: Period = '7d';
  funnelSteps = FUNNEL_STEPS;

  periods: { value: Period; label: string }[] = [
    { value: '7d',  label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: 'all', label: 'All Time' },
  ];

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.load();
  }

  async load() {
    this.isLoading = true;

    const cutoff = this.getCutoff(this.selectedPeriod);

    let query = this.supabase
      .from('ab_test_events')
      .select('variant, event, session_id')
      .eq('test_name', 'book_intro_vs_zip');

    if (cutoff) {
      query = query.gte('created_at', cutoff);
    }

    const { data, error } = await query;

    if (error || !data) {
      this.isLoading = false;
      return;
    }

    // Count unique sessions per variant+event
    const counts: { A: VariantData; B: VariantData } = { A: {}, B: {} };

    // Use sets to deduplicate by session_id
    const sets: { A: { [event: string]: Set<string> }; B: { [event: string]: Set<string> } } = {
      A: {}, B: {}
    };

    for (const row of data) {
      const v = row.variant as 'A' | 'B';
      if (!sets[v][row.event]) sets[v][row.event] = new Set();
      sets[v][row.event].add(row.session_id);
    }

    for (const v of ['A', 'B'] as const) {
      for (const [event, set] of Object.entries(sets[v])) {
        counts[v][event] = set.size;
      }
    }

    this.result = {
      testName: 'Intro Screen vs. ZIP First',
      period: this.periods.find(p => p.value === this.selectedPeriod)?.label ?? '',
      variantA: counts.A,
      variantB: counts.B,
      totalA: counts.A['entered'] ?? 0,
      totalB: counts.B['entered'] ?? 0,
    };

    this.isLoading = false;
  }

  selectPeriod(period: Period) {
    this.selectedPeriod = period;
    this.load();
  }

  getCount(variant: 'A' | 'B', event: string): number {
    if (!this.result) return 0;
    const data = variant === 'A' ? this.result.variantA : this.result.variantB;
    return data[event] ?? 0;
  }

  getRate(variant: 'A' | 'B', event: string): string {
    const total = variant === 'A' ? this.result?.totalA : this.result?.totalB;
    if (!total) return '—';
    const count = this.getCount(variant, event);
    return (count / total * 100).toFixed(1) + '%';
  }

  getWinner(event: string): 'A' | 'B' | 'tie' | null {
    if (!this.result) return null;
    const rateA = this.result.totalA > 0 ? this.getCount('A', event) / this.result.totalA : 0;
    const rateB = this.result.totalB > 0 ? this.getCount('B', event) / this.result.totalB : 0;
    if (Math.abs(rateA - rateB) < 0.01) return 'tie';
    return rateA > rateB ? 'A' : 'B';
  }

  getLift(event: string): string {
    if (!this.result || !this.result.totalA || !this.result.totalB) return '—';
    const rateA = this.getCount('A', event) / this.result.totalA;
    const rateB = this.getCount('B', event) / this.result.totalB;
    if (!rateA) return '—';
    const lift = ((rateB - rateA) / rateA) * 100;
    const sign = lift > 0 ? '+' : '';
    return `${sign}${lift.toFixed(1)}%`;
  }

  private getCutoff(period: Period): string | null {
    if (period === 'all') return null;
    const days = period === '7d' ? 7 : 30;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }
}
