"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, CircleAlertIcon, Loader2Icon } from "lucide-react"

const TOAST_ICON_SIZE = 22
const TOAST_ICON_STROKE = 2.25

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: <CircleCheckIcon size={TOAST_ICON_SIZE} strokeWidth={TOAST_ICON_STROKE} color="var(--green)" />,
        info: <InfoIcon size={TOAST_ICON_SIZE} strokeWidth={TOAST_ICON_STROKE} color="var(--accent)" />,
        warning: <TriangleAlertIcon size={TOAST_ICON_SIZE} strokeWidth={TOAST_ICON_STROKE} color="var(--amber)" />,
        error: <CircleAlertIcon size={TOAST_ICON_SIZE} strokeWidth={TOAST_ICON_STROKE} color="var(--rose)" />,
        loading: <Loader2Icon className="size-5 animate-spin text-muted-foreground" />,
      }}
      style={
        {
          "--normal-bg": "var(--surf)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radiusLg)",
          "--width": "420px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
        duration: 4500,
      }}
      {...props}
    />
  )
}

export { Toaster }
