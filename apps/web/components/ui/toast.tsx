"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CircleAlert, CircleCheck, Info, type LucideIcon, TriangleAlert, X } from "lucide-react"
import { Toast as ToastPrimitive } from "radix-ui"

type ToastVariant = "info" | "success" | "warning" | "danger"

export interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
  /** Milliseconds before closing; defaults to 5 s, or until closed for `danger`. */
  duration?: number
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "variant" | "duration">> {
  id: number
  description?: string
  open: boolean
}

/** How long a toast stays (005 contracts/components.md "Toast"); errors stay until closed unless given a `duration`. */
const DURATION_MS = 5_000

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: "border-info",
  success: "border-success",
  warning: "border-warning",
  danger: "border-danger",
}

const ICONS: Record<ToastVariant, [LucideIcon, string]> = {
  info: [Info, "text-info"],
  success: [CircleCheck, "text-success"],
  warning: [TriangleAlert, "text-warning"],
  danger: [CircleAlert, "text-danger"],
}

const ToastContext = React.createContext<((options: ToastOptions) => void) | null>(null)

/** `toast()` of the nearest `Toaster`. A toast is never the only place of needed information. */
function useToast() {
  const toast = React.useContext(ToastContext)
  if (!toast) throw new Error("useToast precisa de um <Toaster> acima (app/providers.tsx).")
  return { toast }
}

/**
 * Provides `useToast()` and shows the toasts (Radix Toast): announced to assistive technology,
 * paused while hovered or focused, `--z-toast`, closed after 5 s except errors without a `duration`.
 */
function Toaster({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const nextId = React.useRef(0)

  const toast = React.useCallback((options: ToastOptions) => {
    nextId.current += 1
    const variant = options.variant ?? "info"
    const item: ToastItem = {
      id: nextId.current,
      title: options.title,
      description: options.description,
      variant,
      duration: options.duration ?? (variant === "danger" ? Infinity : DURATION_MS),
      open: true,
    }
    setToasts((current) => [...current, item])
  }, [])

  const close = (id: number) =>
    setToasts((current) => current.filter((item) => item.id !== id))

  return (
    <ToastContext.Provider value={toast}>
      <ToastPrimitive.Provider label="Notificação" duration={DURATION_MS}>
        {children}
        {toasts.map((item) => {
          const [Icon, iconColor] = ICONS[item.variant]
          return (
            <ToastPrimitive.Root
              key={item.id}
              data-slot="toast"
              data-variant={item.variant}
              type={item.variant === "danger" ? "foreground" : "background"}
              duration={item.duration}
              onOpenChange={(open) => {
                if (!open) close(item.id)
              }}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-md border border-l-2 bg-surface p-4 text-foreground shadow-overlay",
                VARIANT_CLASSES[item.variant]
              )}
            >
              <Icon aria-hidden="true" className={cn("mt-px size-5 shrink-0", iconColor)} />
              <div className="grid min-w-0 flex-1 gap-1">
                <ToastPrimitive.Title className="text-body font-semibold">{item.title}</ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="text-body-sm text-text-secondary">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label="Fechar notificação"
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm text-text-secondary hover:bg-accent hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          label="Notificações ({hotkey})"
          className="fixed right-0 bottom-0 z-(--z-toast) m-0 flex w-full list-none flex-col gap-2 p-4 sm:max-w-sm"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export { Toaster, useToast }
