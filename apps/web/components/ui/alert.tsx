import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert } from "lucide-react"

type AlertVariant = "info" | "success" | "warning" | "danger"

// 005 contracts/components.md "Alert": semantic surface, a left border and an icon of its own
// per variant, so the meaning never depends on color alone.
const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-md border-l-2 p-4 text-foreground [&>svg]:size-5 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        info: "border-info bg-info-surface",
        success: "border-success bg-success-surface",
        warning: "border-warning bg-warning-surface",
        danger: "border-danger bg-danger-surface",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

const ICONS: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
}

const ICON_COLORS: Record<AlertVariant, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
}

// Only an interrupting error is `role="alert"`; the other variants are polite `status`.
const ROLES: Record<AlertVariant, React.AriaRole> = {
  info: "status",
  success: "status",
  warning: "status",
  danger: "alert",
}

/**
 * `default` and `destructive` remain as aliases of `info` and `danger`. Pass `role` (even
 * `undefined`) to replace the variant's role.
 */
function Alert({
  className,
  variant = "info",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: AlertVariant | "default" | "destructive"
}) {
  const resolved: AlertVariant =
    variant === "default" ? "info" : variant === "destructive" ? "danger" : variant
  const Icon = ICONS[resolved]
  const role = "role" in props ? props.role : ROLES[resolved]

  return (
    <div
      data-slot="alert"
      data-variant={resolved}
      className={cn(alertVariants({ variant: resolved }), className)}
      {...props}
      role={role}
    >
      <Icon aria-hidden="true" className={cn("mt-px", ICON_COLORS[resolved])} />
      <div className="grid min-w-0 flex-1 justify-items-start gap-1">{children}</div>
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-semibold", className)}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("grid justify-items-start gap-1", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, type AlertVariant }
