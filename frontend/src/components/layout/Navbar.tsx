import Link from "next/link";
import { ROUTES } from "@/constants/routes";
import { env } from "@/config/env";

export function Navbar() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href={ROUTES.HOME} className="font-semibold">
          {env.appName}
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href={ROUTES.DASHBOARD} className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href={ROUTES.LOGIN} className="text-muted-foreground hover:text-foreground">
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
