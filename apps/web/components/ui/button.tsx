import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { LoaderCircle } from "lucide-react"
import { Slot } from "radix-ui"

// 005 contracts/components.md "Button": `default` and `destructive` stay as aliases of
// `primary` and `danger`, and `default` as an alias of the `md` size.
const VARIANT_CLASSES = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary:
    "border-primary bg-secondary text-secondary-foreground hover:bg-primary-hover hover:text-primary-foreground",
  outline:
    "border-border-control bg-surface text-foreground hover:bg-accent hover:text-accent-foreground",
  ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
  danger:
    "border-danger bg-surface text-danger-text hover:bg-danger-surface",
  link: "h-auto min-h-11 border-0 p-0 font-normal text-primary underline underline-offset-4 hover:text-primary-hover disabled:bg-transparent",
} as const

const SIZE_CLASSES = {
  sm: "min-h-9 gap-2 px-3 py-1 text-body-sm has-[>svg]:px-2",
  md: "min-h-11 px-5 py-2 has-[>svg]:px-4",
  icon: "size-11",
} as const

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-transparent text-body font-semibold whitespace-nowrap transition-colors duration-(--duration-fast) ease-standard active:translate-y-px disabled:pointer-events-none disabled:border-disabled-border disabled:bg-disabled-bg disabled:text-disabled-fg aria-disabled:cursor-progress aria-disabled:opacity-85 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        ...VARIANT_CLASSES,
        default: VARIANT_CLASSES.primary,
        destructive: VARIANT_CLASSES.danger,
      },
      size: {
        ...SIZE_CLASSES,
        default: SIZE_CLASSES.md,
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

const officialVariant = (variant: ButtonVariant) =>
  variant === "default" ? "primary" : variant === "destructive" ? "danger" : variant
const officialSize = (size: ButtonSize) => (size === "default" ? "md" : size)

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  disabled,
  children,
  "aria-busy": ariaBusy,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Disables the button, marks it `aria-busy` and shows a spinner; the label stays. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const resolvedVariant = officialVariant(variant ?? "primary")
  const resolvedSize = officialSize(size ?? "md")

  return (
    <Comp
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize, className }))}
      disabled={disabled || loading || undefined}
      aria-busy={loading || ariaBusy || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
