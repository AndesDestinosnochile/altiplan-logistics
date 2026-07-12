import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SUPABASE_CONFIGURED } from "@/integrations/supabase/client";

export function SupabaseSetupBanner() {
  const { t } = useTranslation();
  if (SUPABASE_CONFIGURED) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
      <div>
        <p className="font-semibold text-foreground">{t("setup.title")}</p>
        <p className="mt-1 text-muted-foreground">{t("setup.body")}</p>
      </div>
    </div>
  );
}
