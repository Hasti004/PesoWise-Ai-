import { Card, CardContent } from "@/components/ui/card";
import { Quote } from "lucide-react";

export function Testimonials() {
  const testimonials = [
    {
      quote:
        "PesoWise eliminated our spreadsheet chaos. Approvals are now instant, and we have complete visibility into every expense.",
      author: "Finance Lead",
      role: "Mid-size Manufacturing",
    },
    {
      quote:
        "The multi-organization support is perfect for our setup. Each location manages expenses independently, but we get unified reporting.",
      author: "Operations Manager",
      role: "Multi-location Retail",
    },
  ];

  return (
    <div className="space-y-12">
      <h2 className="text-2xl font-bold text-foreground text-center md:text-3xl mb-8">
        What teams are saying
      </h2>
      <div className="grid md:grid-cols-2 gap-6">
        {testimonials.map((t, i) => (
          <Card key={i} className="shadow-soft card-hover border-border bg-card">
            <CardContent className="pt-6">
              <Quote className="h-8 w-8 text-primary mb-4" />
              <p className="text-muted-foreground mb-4 italic">&quot;{t.quote}&quot;</p>
              <p className="font-semibold text-foreground">{t.author}</p>
              <p className="text-sm text-muted-foreground">{t.role}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
