import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Printer, Shield, Users } from "lucide-react";
import { format } from "date-fns";

export default function VAContactSheet() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["vaCompanyContacts"],
    queryFn: () => base44.entities.User.list(),
  });

  const officers = useMemo(
    () =>
      users
        .filter(
          (user) =>
            !user.termination_date &&
            !user.additional_roles?.includes("client") &&
            !user.additional_roles?.includes("student") &&
            (user.role === "admin" ||
              user.additional_roles?.includes("officer") ||
              user.additional_roles?.includes("supervisor") ||
              user.additional_roles?.includes("hr") ||
              user.additional_roles?.includes("trainer") ||
              user.additional_roles?.includes("accounting"))
        )
        .sort((a, b) =>
          `${a.last_name || ""}${a.first_name || ""}`.localeCompare(
            `${b.last_name || ""}${b.first_name || ""}`
          )
        ),
    [users]
  );

  const groups = useMemo(
    () =>
      officers.reduce((grouped, user) => {
        const key = user.division || "Company Staff";
        (grouped[key] ??= []).push(user);
        return grouped;
      }, {}),
    [officers]
  );

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400">Loading company contacts…</div>;
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5 print:max-w-none">
        <div className="mobile-page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg border border-blue-500/40 bg-blue-950/30 p-2.5 sm:p-3">
              <Shield className="h-7 w-7 text-blue-400 sm:h-8 sm:w-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Black Point Protection Contact Sheet</h1>
              <p className="text-sm text-slate-400">Company personnel directory</p>
            </div>
          </div>
          <Button variant="outline" className="w-full print:hidden sm:w-auto" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>

        {Object.entries(groups)
          .sort()
          .map(([division, list]) => (
            <Card key={division} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="border-b border-slate-700 px-4 py-3">
                  <h2 className="text-lg font-bold">{division}</h2>
                  <p className="text-xs text-slate-400">{list.length} personnel</p>
                </div>

                <div className="divide-y divide-slate-700/60 md:hidden">
                  {list.map((user) => (
                    <article key={user.id} className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-semibold">
                            {user.last_name}, {user.first_name}
                          </p>
                          <p className="text-xs text-slate-400">
                            Badge {user.badge_number || "—"} · Unit {user.unit_number || "—"}
                          </p>
                        </div>
                        <Badge variant="outline">{user.rank || "Employee"}</Badge>
                      </div>
                      <div className="grid gap-2 text-sm">
                        <a className="flex min-w-0 items-center gap-2 text-blue-400" href={`mailto:${user.email}`}>
                          <Mail className="h-4 w-4 shrink-0" />
                          <span className="break-all">{user.email}</span>
                        </a>
                        {user.mobile_phone ? (
                          <a className="flex items-center gap-2 text-blue-400" href={`tel:${user.mobile_phone}`}>
                            <Phone className="h-4 w-4 shrink-0" />
                            {user.mobile_phone}
                          </a>
                        ) : (
                          <span className="text-slate-400">No mobile number</span>
                        )}
                        <p className="text-xs text-slate-400">
                          DCJS expiration: {user.dcjs_expiration ? format(new Date(user.dcjs_expiration), "MM/dd/yyyy") : "—"}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="p-3 text-left">Name</th>
                        <th className="p-3 text-left">Rank</th>
                        <th className="p-3 text-left">Email</th>
                        <th className="p-3 text-left">Mobile</th>
                        <th className="p-3 text-left">Badge</th>
                        <th className="p-3 text-left">Unit</th>
                        <th className="p-3 text-left">DCJS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((user) => (
                        <tr key={user.id} className="border-t border-slate-700/60">
                          <td className="p-3 font-semibold">{user.last_name}, {user.first_name}</td>
                          <td className="p-3"><Badge variant="outline">{user.rank || "Employee"}</Badge></td>
                          <td className="p-3">
                            <a className="inline-flex items-center gap-1 text-blue-400" href={`mailto:${user.email}`}>
                              <Mail className="h-3 w-3" />{user.email}
                            </a>
                          </td>
                          <td className="p-3">
                            {user.mobile_phone ? (
                              <a className="inline-flex items-center gap-1 text-blue-400" href={`tel:${user.mobile_phone}`}>
                                <Phone className="h-3 w-3" />{user.mobile_phone}
                              </a>
                            ) : "—"}
                          </td>
                          <td className="p-3">{user.badge_number || "—"}</td>
                          <td className="p-3">{user.unit_number || "—"}</td>
                          <td className="p-3">{user.dcjs_expiration ? format(new Date(user.dcjs_expiration), "MM/dd/yyyy") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}

        {officers.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-slate-500" />
              <p>No active company personnel were found.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
