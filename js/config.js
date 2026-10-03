// Supabase configuration. Committed intentionally — this only holds the
// public anon key, which is safe in frontend code because Row Level
// Security (RLS) on the database, not secrecy of this key, protects the
// data. The service_role key must NEVER go in a file like this.
window.SUPABASE_CONFIG = {
  url: "https://mmihssjobffpumhoiaaa.supabase.co",
  anonKey: "sb_publishable_D1Slx8JFMy48yogSG05-hQ_W_v5eBhg",
};
