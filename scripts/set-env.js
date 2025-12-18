import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetPath = path.join(__dirname, '../src/environments/environment.prod.ts');

// Only generate if running in CI/production build (e.g., Vercel)
// Skip if NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set (local dev)
if (!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
  console.log('No NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN found, skipping environment generation');
  console.log('Using existing environment.prod.ts');
  process.exit(0);
}

const envConfigFile = `export const environment = {
  production: true,
  apiUrl: '${process.env.API_URL || 'https://www.royalpawzusa.com'}',
  mapboxAccessToken: '${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''}',
  supabase: {
    url: '${process.env.SUPABASE_URL || 'https://api.royalpawzusa.com'}',
    anonKey: '${process.env.SUPABASE_ANON_KEY || ''}',
    serviceRoleKey: '${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}'
  },
  stripePublishableKey: '${process.env.STRIPE_PUBLISHABLE_KEY || ''}'
};
`;

fs.writeFileSync(targetPath, envConfigFile);
console.log('Environment file generated successfully at:', targetPath);
