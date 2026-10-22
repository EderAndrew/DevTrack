import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** "Beta" next to the DevTrack name while production runs as a beta; outside the brand link, so its name stays "DevTrack". */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <Badge variant="info" className={cn("uppercase tracking-wide", className)}>
      Beta
    </Badge>
  );
}
