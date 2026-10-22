"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

/**
 * The series of a chart, by the key of its value in the data: the name in words, the color token
 * (`var(--chart-1)`, or a state color for outcomes) and, for a state, the icon shown in the legend.
 */
type ChartConfig = Record<string, { label: string; color: string; icon?: LucideIcon }>

const ChartContext = React.createContext<ChartConfig | null>(null)

function useChartConfig(): ChartConfig {
  const config = React.useContext(ChartContext)
  if (!config) throw new Error("useChartConfig must be used inside <ChartContainer>")
  return config
}

/** The CSS variable of a series' color, set by `ChartContainer`: `fill={seriesColor("completed")}`. */
const seriesColor = (key: string) => `var(--series-${key})`

/**
 * Frame of a Recharts chart (006 amendment 2026-10-22): sets each series' color as `--series-<key>`,
 * styles the axes, grid and cursor with tokens, sizes the chart to the container's width and the
 * given `height`, and, with two or more series, lists them below with icon and name (never the
 * color alone). The chart itself keeps Recharts' keyboard layer; the screen pairs it with a table.
 */
function ChartContainer({
  config,
  height,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  config: ChartConfig
  height: number
  children: React.ReactElement
}) {
  const series = Object.fromEntries(
    Object.entries(config).map(([key, { color }]) => [`--series-${key}`, color]),
  ) as React.CSSProperties
  return (
    <ChartContext.Provider value={config}>
      <div data-slot="chart" className={cn("flex w-full flex-col gap-3", className)} style={series} {...props}>
        <div
          className="w-full text-caption [&_.recharts-cartesian-axis-tick-value]:fill-text-secondary [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-tooltip-cursor]:fill-muted"
          style={{ height }}
        >
          <RechartsPrimitive.ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height }}>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        </div>
        {Object.keys(config).length > 1 ? <ChartLegend /> : null}
      </div>
    </ChartContext.Provider>
  )
}

/** The series in words, each with its icon (or a square) in its color. */
function ChartLegend() {
  const config = useChartConfig()
  return (
    <ul
      data-slot="chart-legend"
      className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-caption text-foreground"
    >
      {Object.entries(config).map(([key, { label, icon: Icon }]) => (
        <li
          key={key}
          className="flex items-center gap-2"
          style={{ "--swatch": seriesColor(key) } as React.CSSProperties}
        >
          {Icon ? (
            <Icon aria-hidden="true" className="size-4 shrink-0 text-(--swatch)" />
          ) : (
            <span aria-hidden="true" className="size-2 shrink-0 rounded-sm bg-(--swatch)" />
          )}
          {label}
        </li>
      ))}
    </ul>
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

interface ChartTooltipContentProps {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>
  label?: React.ReactNode
  /** Formats each value in words or numbers; the raw value otherwise. */
  formatValue?: (value: number, key: string) => React.ReactNode
}

/** Tooltip of a chart: the category, then each series with its square, name and value, in order. */
function ChartTooltipContent({ active, payload, label, formatValue }: ChartTooltipContentProps) {
  const config = useChartConfig()
  if (!active || !payload?.length) return null
  return (
    <div
      data-slot="chart-tooltip"
      className="grid min-w-32 gap-1 rounded-md border border-border bg-popover px-3 py-2 text-caption text-popover-foreground shadow-overlay"
    >
      {label !== undefined ? <p className="m-0 font-medium">{label}</p> : null}
      {payload.map((item) => {
        const key = String(item.dataKey)
        const value = Number(item.value)
        return (
          <div
            key={key}
            className="flex items-center gap-2"
            style={{ "--swatch": seriesColor(key) } as React.CSSProperties}
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-sm bg-(--swatch)" />
            <span className="text-text-secondary">{config[key]?.label ?? key}</span>
            <span className="ml-auto font-medium tabular-nums">{formatValue ? formatValue(value, key) : value}</span>
          </div>
        )
      })}
    </div>
  )
}

export { ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent, seriesColor, type ChartConfig }
