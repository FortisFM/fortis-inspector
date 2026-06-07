import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { Phone, Mail, Building2 } from "lucide-react";
import logoNavy from "@assets/logo-navy-on-white.jpg";

export default function Settings() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Settings" description="Account and company details" />
      <div className="space-y-5">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 font-serif text-base font-semibold">Account</h2>
            <Row label="Name" value={user?.name || ""} />
            <Row label="Email" value={user?.email || ""} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <img src={logoNavy} alt="Fortis FM" className="h-10 w-auto" />
            </div>
            <h2 className="mb-1 font-serif text-base font-semibold">Fortis FM</h2>
            <p className="mb-4 text-sm text-muted-foreground">Facilities Management Specialists</p>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> (07) 3472 7579</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> admin@fortisfm.com.au</p>
              <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /> Brisbane, QLD</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            <h2 className="mb-2 font-serif text-base font-semibold text-foreground">Email sending</h2>
            <p>
              Contractor emails currently open in your mail app or copy to clipboard. To enable automated
              Microsoft 365 sending, see the README for SMTP app-password or Graph API setup instructions.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
