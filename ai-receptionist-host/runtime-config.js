const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export async function loadReceptionRuntimeConfig() {
  const isLocal = LOCAL_HOSTS.has(window.location.hostname.toLowerCase());

  if (isLocal) {
    let response;
    try {
      response = await fetch("/runtime-config.local.json", { cache: "no-store" });
    } catch {
      throw new Error("Lokale Supabase-config ontbreekt. Start Reception AI via npm run reception:local.");
    }
    if (!response.ok) {
      throw new Error("Lokale Supabase-config ontbreekt. Start Reception AI via npm run reception:local.");
    }

    const local = await response.json();
    const supabaseUrl = new URL(String(local.supabaseUrl || ""));
    if (!LOCAL_HOSTS.has(supabaseUrl.hostname.toLowerCase())) {
      throw new Error("Veiligheidsstop: lokale Reception AI mag uitsluitend een lokale Supabase-URL gebruiken.");
    }
    if (!local.supabaseAnonKey) {
      throw new Error("De lokale Supabase publishable/anon key ontbreekt.");
    }

    return {
      supabaseUrl: supabaseUrl.origin,
      supabaseAnonKey: String(local.supabaseAnonKey),
      authEmailOrigin: window.location.origin,
      isLocal: true
    };
  }

  // Public client configuration for the deployed Reception AI site.
  // This publishable key is designed for browser use; authorization is enforced by RLS and Edge Functions.
  return {
    supabaseUrl: "https://ndecxbsrxspkuxjsbndq.supabase.co",
    supabaseAnonKey: "sb_publishable_rhEeG3_B95xt8PA_MlG86Q_oti2Rklc",
    authEmailOrigin: "https://reception-ai-luxwash.vercel.app",
    isLocal: false
  };
}
