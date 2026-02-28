// Development environment - values are hardcoded for local development
// Production values are injected at build time from Vercel env vars via scripts/set-env.js
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  stripePublishableKey: 'pk_test_51SJkLaE9Us2CbXXPlGueWnbwUpp0gdodcSahvOSoqLa2eIJDaGe7gxFdAEWmwkVwKJqyQ5Q5v5L6C1JwsdtTbTt9003dtwckoZ',
  mapboxAccessToken: 'pk.eyJ1IjoiaHphcHBlcnoiLCJhIjoiY21oOGh4c3ZzMHgxbTJrb2E4dW5jcmxiOSJ9.v-SWnWwRo7-Ypir_nzCcSQ',
  supabase: {
    url: 'https://api.royalpawzusa.com',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqZXdqdGF6cmV6bGt5ZW1kdWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyMDc4OTEsImV4cCI6MjA3NTc4Mzg5MX0.x0BOwZByyxUdlyJqXPdfiuFYF3U94Le06Fc1eGabOvM',
    // serviceRoleKey removed - must NEVER be in client-side bundles
  },
  smsService: {
    url: 'http://localhost:8000',
    apiKey: 'dev-api-key'
  },
  googleReviewUrl: 'https://g.page/r/YOUR_PLACE_ID/review'
};
