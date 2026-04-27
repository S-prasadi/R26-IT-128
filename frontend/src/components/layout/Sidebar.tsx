import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { ROUTES } from "@/constants/routes";

const navItems = [
  { label: "Dashboard", href: ROUTES.DASHBOARD },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col border-r p-4">
      <span className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Navigation
      </span>
      <Separator className="mb-4" />
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
