import { Construction } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Em desenvolvimento
        </p>
        <h1 className="mt-1 text-3xl">{title}</h1>
      </div>
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Construction className="h-5 w-5" />
          </div>
          <p className="text-lg font-medium">Em breve</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {description ?? "Este módulo será liberado nas próximas entregas."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
