import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/services/supabase.service';

// ── Concluded test ────────────────────────────────────────
interface IntroZipResult {
  period: string;
  totalEntered: number;
  entriesA: number;
  entriesB: number;
  convertedCountA: number;
  convertedCountB: number;
  convertedRateA: number;
  convertedRateB: number;
  avgValueA: number;
  avgValueB: number;
}

// ── Active test ───────────────────────────────────────────
interface InfoPlacementResult {
  period: string;
  totalEntered: number;
  entriesA: number;
  entriesB: number;
  // Lead capture: sessions that submitted /book/info
  leadCaptureCountA: number;
  leadCaptureCountB: number;
  leadCaptureRateA: number;
  leadCaptureRateB: number;
  // Checkout reached
  checkoutCountA: number;
  checkoutCountB: number;
  checkoutRateA: number;
  checkoutRateB: number;
  // Converted
  convertedCountA: number;
  convertedCountB: number;
  convertedRateA: number;
  convertedRateB: number;
  // Abandoned after info (gave contact but didn't book = recoverable)
  abandonedAfterInfoA: number;
  abandonedAfterInfoB: number;
}

type Period = '7d' | '30d' | 'all';

@Component({
  selector: 'app-ab-tests',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ab-tests.component.html',
  styleUrls: ['./ab-tests.component.scss']
})
export class AbTestsComponent implements OnInit {
  introZip: IntroZipResult | null = null;
  infoPlacement: InfoPlacementResult | null = null;
  isLoading = true;
  selectedPeriod: Period = '7d';

  periods: { value: Period; label: string }[] = [
    { value: '7d',  label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: 'all', label: 'All Time' },
  ];

  constructor(private supabase: SupabaseService) {}

  ngOnInit() { this.load(); }

  async load() {
    this.isLoading = true;
    const cutoff = this.getCutoff(this.selectedPeriod);

    const [r1, r2] = await Promise.all([
      this.loadIntroZip(cutoff),
      this.loadInfoPlacement(cutoff),
    ]);

    this.introZip = r1;
    this.infoPlacement = r2;
    this.isLoading = false;
  }

  // ── book_intro_vs_zip (concluded) ─────────────────────
  private async loadIntroZip(cutoff: string | null): Promise<IntroZipResult | null> {
    let query = this.supabase
      .from('ab_test_events')
      .select('variant, event, session_id, metadata')
      .eq('test_name', 'book_intro_vs_zip');
    if (cutoff) query = query.gte('created_at', cutoff);
    const { data, error } = await query;
    if (error || !data) return null;

    const sets: Record<'A' | 'B', Record<string, Set<string>>> = { A: {}, B: {} };
    const values: Record<'A' | 'B', number[]> = { A: [], B: [] };

    for (const row of data) {
      const v = row.variant as 'A' | 'B';
      if (!sets[v][row.event]) sets[v][row.event] = new Set();
      sets[v][row.event].add(row.session_id);
      if (row.event === 'converted' && row.metadata?.total) {
        values[v].push(Number(row.metadata.total));
      }
    }

    const intersect = (s: Set<string>, base: Set<string>) =>
      new Set([...s].filter(id => base.has(id)));

    const enteredA = sets.A['entered'] ?? new Set<string>();
    const enteredB = sets.B['entered'] ?? new Set<string>();
    const eA = enteredA.size, eB = enteredB.size;
    const cA = intersect(sets.A['converted'] ?? new Set(), enteredA).size;
    const cB = intersect(sets.B['converted'] ?? new Set(), enteredB).size;
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
      period: this.periods.find(p => p.value === this.selectedPeriod)?.label ?? '',
      totalEntered: eA + eB,
      entriesA: eA, entriesB: eB,
      convertedCountA: cA, convertedCountB: cB,
      convertedRateA: eA > 0 ? cA / eA : 0,
      convertedRateB: eB > 0 ? cB / eB : 0,
      avgValueA: avg(values.A),
      avgValueB: avg(values.B),
    };
  }

  // ── book_info_placement (active) ──────────────────────
  private async loadInfoPlacement(cutoff: string | null): Promise<InfoPlacementResult | null> {
    let query = this.supabase
      .from('ab_test_events')
      .select('variant, event, session_id, metadata')
      .eq('test_name', 'book_info_placement');
    if (cutoff) query = query.gte('created_at', cutoff);
    const { data, error } = await query;
    if (error || !data) return null;

    const sets: Record<'A' | 'B', Record<string, Set<string>>> = { A: {}, B: {} };

    for (const row of data) {
      const v = row.variant as 'A' | 'B';
      if (!sets[v][row.event]) sets[v][row.event] = new Set();
      sets[v][row.event].add(row.session_id);
    }

    const intersect = (s: Set<string>, base: Set<string>) =>
      new Set([...s].filter(id => base.has(id)));

    const enteredA = sets.A['entered'] ?? new Set<string>();
    const enteredB = sets.B['entered'] ?? new Set<string>();
    const eA = enteredA.size, eB = enteredB.size;

    const lcA = intersect(sets.A['info_submitted'] ?? new Set(), enteredA).size;
    const lcB = intersect(sets.B['info_submitted'] ?? new Set(), enteredB).size;
    const chA = intersect(sets.A['checkout_reached'] ?? new Set(), enteredA).size;
    const chB = intersect(sets.B['checkout_reached'] ?? new Set(), enteredB).size;
    const cA  = intersect(sets.A['converted'] ?? new Set(), enteredA).size;
    const cB  = intersect(sets.B['converted'] ?? new Set(), enteredB).size;

    return {
      period: this.periods.find(p => p.value === this.selectedPeriod)?.label ?? '',
      totalEntered: eA + eB,
      entriesA: eA, entriesB: eB,
      leadCaptureCountA: lcA, leadCaptureCountB: lcB,
      leadCaptureRateA: eA > 0 ? lcA / eA : 0,
      leadCaptureRateB: eB > 0 ? lcB / eB : 0,
      checkoutCountA: chA, checkoutCountB: chB,
      checkoutRateA: eA > 0 ? chA / eA : 0,
      checkoutRateB: eB > 0 ? chB / eB : 0,
      convertedCountA: cA, convertedCountB: cB,
      convertedRateA: eA > 0 ? cA / eA : 0,
      convertedRateB: eB > 0 ? cB / eB : 0,
      abandonedAfterInfoA: Math.max(0, lcA - cA),
      abandonedAfterInfoB: Math.max(0, lcB - cB),
    };
  }

  selectPeriod(p: Period) { this.selectedPeriod = p; this.load(); }

  // ── Helpers ───────────────────────────────────────────
  winner(rateA: number, rateB: number): 'A' | 'B' | 'tie' {
    if (Math.abs(rateA - rateB) < 0.01) return 'tie';
    return rateA > rateB ? 'A' : 'B';
  }

  lift(rateA: number, rateB: number): string {
    if (!rateA) return '—';
    const pct = ((rateB - rateA) / rateA) * 100;
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  }

  fmt(rate: number): string { return (rate * 100).toFixed(1) + '%'; }
  fmtDollar(n: number): string { return n > 0 ? '$' + n.toFixed(0) : '—'; }
  splitPct(n: number, total: number): string {
    return total ? (n / total * 100).toFixed(0) + '%' : '0%';
  }

  private getCutoff(p: Period): string | null {
    if (p === 'all') return null;
    const d = new Date();
    d.setDate(d.getDate() - (p === '7d' ? 7 : 30));
    return d.toISOString();
  }
}
