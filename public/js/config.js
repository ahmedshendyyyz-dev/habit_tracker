// Your Supabase project.
// The URL and the publishable key are public by design. Your data is protected by your login and by
// the database's access rules (supabase/setup.sql), not by keeping these two values secret.
// Never put the secret or service_role key here.
export const SUPABASE_URL = 'https://rhfypcejazglugtkgsap.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_zj21bE8BDaazjOpaUg_CzQ_Q9SiSpR_';

// The public half of the notification key. Its private half is a secret kept only in Supabase.
export const VAPID_PUBLIC_KEY = 'BPUYhdsUUaAsAa620PqS-IqklFK-W-ig7NVchDehm1xlb3NbSUy1gJDvmjVtWGWccwfIskeNXPQCEjOa1zzizyQ';

// Open the app with ?local in the address to use the old local server instead of Supabase.
// That is how the app is tested on a copy of the data, without touching your real data.
export const LOCAL_MODE = new URLSearchParams(window.location.search).has('local');
