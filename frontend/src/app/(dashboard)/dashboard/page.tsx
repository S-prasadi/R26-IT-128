import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Welcome back. Here's an overview of your data."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {["Total Users", "Active Sessions", "Revenue"].map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">—</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
