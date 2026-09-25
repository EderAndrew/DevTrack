"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

/**
 * Tabs within one page (Radix): arrows move between tabs and `aria-selected` marks the current
 * one. Tabs that are routes (the class sections) stay a `<nav>` of links.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-4", className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex flex-wrap gap-1 border-b border-border", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px inline-flex min-h-11 cursor-pointer items-center gap-2 border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-text-secondary transition-colors duration-(--duration-fast) hover:text-foreground disabled:pointer-events-none disabled:text-disabled-fg data-[state=active]:border-primary data-[state=active]:text-foreground [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
