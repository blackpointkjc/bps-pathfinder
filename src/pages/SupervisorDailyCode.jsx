import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Copy, RefreshCw, ArrowDownToLine, ArrowUpFromLine, Clock, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function SupervisorDailyCode() {
  const navigate = useNavigate();
  const [codeRecord, setCodeRecord] = useState(null);
  const [generating, setGenerating] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const isSupervisor = user?.additional_roles?.includes("supervisor");
  const isAdmin = user?.role === "admin";

  const { data: todayChecks, refetch: refetchChecks } = useQuery({
    queryKey: ["supervisorSiteChecks", user?.email, today],
    queryFn: () =>
      base44.entities.SupervisorSiteCheck.filter({
        supervisor_email: user?.email,
        check_date: today,
      }),
    enabled: !!user?.email,
  });

  const generateCode = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("generateSupervisorCode", {
        email: user.email,
        rank: user.rank || "",
        last_name: user.last_name || "",
      });
      setCodeRecord(res.data.code);
    } catch (err) {
      toast.error("Failed to generate code. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (user && (isSupervisor || isAdmin)) {
      generateCode();
    }
  }, [user]);

  const copyCode = () => {
    if (codeRecord?.code) {
      navigator.clipboard.writeText(codeRecord.code);
      toast.success("Code copied to clipboard!");
    }
  };

  const arrivals = todayChecks?.filter((c) => c.action_type === "arrival") || [];
  const departures = todayChecks?.filter((c) => c.action_type === "departure") || [];

  const sortedChecks = [...(todayChecks || [])].sort(
    (a, b) => new Date(a.check_timestamp) - new Date(b.check_timestamp)
  );

  if (user && !isSupervisor && !isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <ShieldCheck className="w-16 h-16 mx-auto text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Access Restricted</h2>
        <p className="text-slate-500 mt-2">This page is only available to supervisors.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-slate-600 -ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Daily Code</h1>
          <p className="text-sm text-slate-500">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
      </div>

      {/* Code Card */}
      <Card className="border-2 border-green-200 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-green-800">
            <ShieldCheck className="w-5 h-5" />
            Today's Supervisor Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {generating ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-8 h-8 text-green-600 animate-spin" />
              <span className="ml-3 text-green-700 font-medium">Generating your code...</span>
            </div>
          ) : codeRecord ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full overflow-hidden rounded-xl border-2 border-green-300 bg-white px-3 py-4 text-center font-mono text-4xl font-bold tracking-[0.2em] text-green-900 shadow-inner select-all sm:w-auto sm:px-6 sm:text-6xl sm:tracking-[0.3em]">
                  {codeRecord.code}
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:ml-4 sm:w-auto sm:grid-cols-1">
                  <Button onClick={copyCode} variant="outline" className="border-green-400 text-green-700 hover:bg-green-100">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button
                    onClick={generateCode}
                    variant="ghost"
                    size="sm"
                    disabled={generating}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-green-200">
                  <ArrowDownToLine className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Arrivals Today</p>
                    <p className="font-bold text-green-800">{arrivals.length} site{arrivals.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-green-200">
                  <ArrowUpFromLine className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Departures Today</p>
                    <p className="font-bold text-red-700">{departures.length} site{departures.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500 bg-white px-3 py-2 rounded-lg border border-slate-200">
                <Clock className="w-3 h-3" />
                Expires at midnight · Share this code only when an officer requests it during a site visit
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-slate-500 mb-4">No code generated yet for today.</p>
              <Button onClick={generateCode} className="bg-green-700 hover:bg-green-800">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Generate My Code
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Site Check Log */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="text-base text-slate-700">Today's Site Check Log</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedChecks.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">No site checks logged today.</p>
          ) : (
            <div className="space-y-3">
              {sortedChecks.map((check) => (
                <div key={check.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {check.action_type === "arrival" ? (
                    <ArrowDownToLine className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <ArrowUpFromLine className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{check.dar_entry_text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs text-slate-400">{check.site_name}</span>
                      <span className="text-xs text-slate-400">
                        {format(new Date(check.check_timestamp), "h:mm a")}
                      </span>
                      {check.entered_by_officer_name && (
                        <span className="text-xs text-slate-400">by {check.entered_by_officer_name}</span>
                      )}
                    </div>
                    {check.note && <p className="text-xs text-slate-500 mt-1 italic">{check.note}</p>}
                  </div>
                  <Badge
                    className={check.action_type === "arrival" ? "bg-green-100 text-green-800 border-green-300" : "bg-red-100 text-red-800 border-red-300"}
                    variant="outline"
                  >
                    {check.action_type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}