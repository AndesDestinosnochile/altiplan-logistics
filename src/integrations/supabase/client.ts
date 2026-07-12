import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

console.log("URL:", url);
console.log("KEY:", anonKey);
console.log(import.meta.env);

if (!url || !anonKey) {
  console.error(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Configure them in your .env file and Netlify environment.",
  );
}

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "public-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "andes-destinos-auth",
  },
});

export const SUPABASE_CONFIGURED = Boolean(url && anonKey);
