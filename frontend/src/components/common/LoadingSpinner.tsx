import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export function LoadingSpinner({ className }: Props) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}
