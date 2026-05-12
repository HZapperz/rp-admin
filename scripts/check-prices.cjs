#!/usr/bin/env node
// Pricing invariant guard.
//
// Fails CI if:
//   (1) The DB `service_packages` table disagrees with the canonical landing
//       page constant (`client-groom-view/lib/constants/services.ts`), OR
//   (2) Anywhere under admin-view/src has a stray hardcoded price table
//       matching the pattern `(SMALL|MEDIUM|LARGE|XL):\s*\d{2,3}` outside of
//       test files and known-allowed fixtures.
//
// History: booking f586cdd2 was corrupted because admin-view's
// `calculatePackagePrice` had a stale $125 for Royal Groom Medium while the DB
// (and landing page) had $140. This guard is here so the next person who
// reintroduces a hardcoded price table fails red on every push.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADMIN_SRC = path.resolve(__dirname, '..', 'src');
const CONSTANTS_FILE = path.resolve(
  REPO_ROOT,
  'client-groom-view',
  'lib',
  'constants',
  'services.ts'
);

const API_URL = process.env.API_URL || 'https://www.royalpawzusa.com';
const PACKAGES_ENDPOINT = `${API_URL.replace(/\/$/, '')}/api/services/packages`;

const SIZES = ['small', 'medium', 'large', 'xl'];
const PACKAGES = ['basic', 'premium', 'deluxe'];

// service_id values in SERVICE_PACKAGES, mapped to canonical package_type
const SERVICE_ID_TO_TYPE = {
  'royal-bath': 'basic',
  'royal-groom': 'premium',
  'royal-spa': 'deluxe',
};

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exitCode = 1;
}

function warn(msg) {
  console.warn(`\n⚠ ${msg}`);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

/**
 * Parse SERVICE_PACKAGES from client-groom-view/lib/constants/services.ts.
 * We don't import the TS file because the script runs as plain Node — we
 * extract the prices via a tolerant regex over the source text.
 */
function readConstantPrices() {
  if (!fs.existsSync(CONSTANTS_FILE)) {
    // Vercel only checks out admin-view, so the sibling client-groom-view repo
    // isn't on disk in CI. The DB ↔ constant drift check is most valuable
    // locally during development; in CI we still rely on the hardcoded-table
    // scan below to catch admin-view regressions. Don't fail the build here.
    warn(`Skipping constant ↔ DB comparison — canonical file not on disk at ${CONSTANTS_FILE}. (Expected in CI where client-groom-view isn't checked out.)`);
    return null;
  }
  const src = fs.readFileSync(CONSTANTS_FILE, 'utf8');
  const out = {};
  // Each package literal looks like: { id: 'royal-groom', ..., prices: { small: 110, medium: 140, large: 165, xl: 195 }, ... }
  const blockRe = /id:\s*'([^']+)'[\s\S]*?prices:\s*\{([^}]+)\}/g;
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    const serviceId = m[1];
    const type = SERVICE_ID_TO_TYPE[serviceId];
    if (!type) continue;
    const priceBlock = m[2];
    const prices = {};
    for (const size of SIZES) {
      const numMatch = new RegExp(`${size}\\s*:\\s*(\\d+(?:\\.\\d+)?)`).exec(priceBlock);
      if (numMatch) prices[size] = Number(numMatch[1]);
    }
    out[type] = prices;
  }
  return out;
}

async function readDbPrices() {
  let res;
  try {
    res = await fetch(PACKAGES_ENDPOINT);
  } catch (err) {
    fail(`Failed to reach ${PACKAGES_ENDPOINT}: ${err.message}`);
    return null;
  }
  if (!res.ok) {
    fail(`${PACKAGES_ENDPOINT} returned ${res.status}`);
    return null;
  }
  const json = await res.json();
  const list = json.data || json.packages || [];
  const out = {};
  for (const pkg of list) {
    const type = pkg.packageType || SERVICE_ID_TO_TYPE[pkg.id] || pkg.package_type;
    if (!type) continue;
    out[type] = {
      small: Number(pkg.prices?.small ?? pkg.price_small),
      medium: Number(pkg.prices?.medium ?? pkg.price_medium),
      large: Number(pkg.prices?.large ?? pkg.price_large),
      xl: Number(pkg.prices?.xl ?? pkg.price_xl),
    };
  }
  return out;
}

function compareTables(constantPrices, dbPrices) {
  if (!constantPrices || !dbPrices) return;
  let mismatches = 0;
  for (const type of PACKAGES) {
    for (const size of SIZES) {
      const c = constantPrices[type]?.[size];
      const d = dbPrices[type]?.[size];
      if (c == null || d == null) {
        fail(`Missing cell for ${type}/${size} (constant=${c}, db=${d})`);
        mismatches++;
        continue;
      }
      if (Math.abs(c - d) > 0.001) {
        fail(`Price drift on ${type}/${size}: landing constant=${c}, DB=${d}`);
        mismatches++;
      }
    }
  }
  if (mismatches === 0) {
    ok(`Constant ↔ DB price table matches (${PACKAGES.length}×${SIZES.length} cells)`);
  } else {
    console.error(
      '\n  → Update DB via the services admin UI, OR update client-groom-view/lib/constants/services.ts to match. They must agree.'
    );
  }
}

/**
 * Walk admin-view/src looking for hardcoded price tables. The regex flags
 * anything that looks like a size→price mapping. Allow:
 *  - This script and its expected callers
 *  - Files explicitly tagged with `// allow-hardcoded-price-table`
 *  - Spec / test files
 *  - Tax-rate / commission constants (different shape)
 */
function scanForHardcodedTables() {
  const PRICE_LINE_RE = /\b(SMALL|MEDIUM|LARGE|XL|small|medium|large|xl)\s*:\s*(\d{2,3})\b/g;
  const ALLOW_TAG = 'allow-hardcoded-price-table';
  const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', 'coverage']);
  const findings = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|html|js)$/.test(entry.name)) continue;
      if (/\.spec\.ts$/.test(entry.name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (src.includes(ALLOW_TAG)) continue;
      PRICE_LINE_RE.lastIndex = 0;
      const hits = [];
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (PRICE_LINE_RE.test(line)) {
          // Heuristic: require at least two consecutive size:price pairs on
          // the same line OR within 3 lines to count as a "table". This
          // avoids false positives like `padding: 145px`.
          const windowText = lines.slice(i, i + 4).join('\n');
          const pairs = windowText.match(PRICE_LINE_RE) || [];
          if (pairs.length >= 2) {
            hits.push({ line: i + 1, text: line.trim() });
          }
        }
        PRICE_LINE_RE.lastIndex = 0;
      }
      if (hits.length > 0) {
        findings.push({ file: path.relative(REPO_ROOT, full), hits });
      }
    }
  }

  walk(ADMIN_SRC);

  if (findings.length === 0) {
    ok('No stray hardcoded price tables under admin-view/src');
    return;
  }

  for (const f of findings) {
    fail(`Hardcoded price table found in ${f.file}:`);
    for (const h of f.hits) {
      console.error(`    L${h.line}: ${h.text}`);
    }
  }
  console.error(
    '\n  → Read prices via PackageService.getPackages() instead. If this is genuinely not a price table, add `// allow-hardcoded-price-table` to the file.'
  );
}

(async function main() {
  console.log(`Pricing invariant check against ${PACKAGES_ENDPOINT}\n`);
  const constantPrices = readConstantPrices();
  const dbPrices = await readDbPrices();
  compareTables(constantPrices, dbPrices);
  scanForHardcodedTables();

  if (process.exitCode && process.exitCode !== 0) {
    console.error('\nPricing invariant check FAILED. See messages above.');
    process.exit(process.exitCode);
  }
  console.log('\nPricing invariant check passed.');
})();
