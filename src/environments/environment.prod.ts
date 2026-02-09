// Production environment - values injected at build time from Vercel env vars
export const environment = {
  production: true,
  apiUrl: 'https://www.royalpawzusa.com',
  mapboxAccessToken: 'pk.eyJ1IjoiaHphcHBlcnoiLCJhIjoiY21oOGh4c3ZzMHgxbTJrb2E4dW5jcmxiOSJ9.v-SWnWwRo7-Ypir_nzCcSQ',
  supabase: {
    url: 'https://api.royalpawzusa.com',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqZXdqdGF6cmV6bGt5ZW1kdWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyMDc4OTEsImV4cCI6MjA3NTc4Mzg5MX0.x0BOwZByyxUdlyJqXPdfiuFYF3U94Le06Fc1eGabOvM',
    serviceRoleKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqZXdqdGF6cmV6bGt5ZW1kdWtpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDIwNzg5MSwiZXhwIjoyMDc1NzgzODkxfQ.NrzErMPUAOGmYpUW18ksm6EMRBAD8Xb-qYmYzeu3NpI'
  },
  stripePublishableKey: '',
  smsService: {
    url: 'https://royalpawz-sms.herokuapp.com',
    apiKey: ''
  }
};
