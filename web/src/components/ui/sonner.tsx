import { useTheme } from "@/lib/theme"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme((s) => s.theme)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      // success / error / warning / info in their own colors; the plain ones tinted with the
      // accent and lifted by a shadow (.cn-toast), so they stand out over the panels (G9)
      richColors
      style={
        {
          "--normal-bg": "color-mix(in oklab, var(--popover) 86%, var(--primary))",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "color-mix(in oklab, var(--border) 40%, var(--primary))",
          "--border-radius": "var(--radius)",
          // clickable also while a dialog is open (it switches off pointer events outside itself):
          // e.g. "Undo" after hiding a filter in the Filters dialog on phones
          pointerEvents: "auto",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
