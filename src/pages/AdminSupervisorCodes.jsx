import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, Search, RefreshCw, XCircle, ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Copy } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function AdminSupervisorCodes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchSupervisor, setSearchSupervisor] = useState("");
  const [searchDate, setSearchDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [generatingAll, setGeneratingAll] = useState(false);

  const { data: user } = useQuery({ queryKey: ["currentUser"], queryFn: () => base44.auth.me() });
  const isAdmin = user?.role === "admin";

  const { data: codes, isLoading: loadingCodes, refetch: refetchCodes } = useQuery({
    queryKey: ["supervisorCodes", searchDate],
    queryFn: () => base44.entities.SupervisorDailyCode.filter({ code_date: searchDate }),
    enabled: !!searchDate,
  });

  const { data: siteChecks, isLoading: loadingChecks } = useQuery({
    queryKey: ["supervisorSiteChecksAdmin", searchDate],
    queryFn: () => base44.entities.SupervisorSiteCheck.filter({ check_date: searchDate }),
    enabled: !!searchDate,
  });

  const { data: allUsers } = useQuery({
    queryKey: ["allUsers"],
    queryFn: () => base44.entities.User.list(),
  });

  const deactivateCodeMutation = useMutation({
    mutationFn: (id) => base44.entities.SupervisorDailyCode.update(id, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supervisorCodes"] });
      toast.success("Code deactivated.");
    },
  });

  const generateAllCodes = async () => {
    if (!allUsers) return;
    setGeneratingAll(true);
    const supervisors = allUsers.filter(u => u.additional_roles?.includes("supervisor") && !u.additional_roles?.includes("client"));
    let generated = 0;
    for (const sup of supervisors) {
      try {
        await base44.functions.invoke("generateSupervisorCode", {
          email: sup.email,
          rank: sup.rank || "",
          last_name: sup.last_name || "",
        });
        generated++;
      } catch {}
    }
    setGeneratingAll(false);
    refetchCodes();
    toast.success(`Generated codes for ${generated} supervisor(s).`);
  };

  const filteredCodes = codes?.filter(c =>
    !searchSupervisor ||
    c.supervisor_email?.toLowerCase().includes(searchSupervisor.toLowerCase()) ||
    c.supervisor_last_name?.toLowerCase().includes(searchSupervisor.toLowerCase())
  ) || [];

  const filteredChecks = siteChecks?.filter(c =>
    !searchSupervisor ||
    c.supervisor_email?.toLowerCase().includes(searchSupervisor.toLowerCase()) ||
    c.supervisor_last_name?.toLowerCase().includes(searchSupervisor.toLowerCase())
  ) || [];

  const sortedChecks = [...filteredChecks].sort(
    (a, b) => new Date(b.check_timestamp) - new Date(a.check_timestamp)
  );

  if (user && !isAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <ShieldCheck className="w-16 h-16 mx-auto text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-700">Access Restricted</h2>
        <p className="text-slate-500 mt-2">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-slate-600 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Supervisor Site Check Admin</h1>
            <p className="text-sm text-slate-500">Manage daily codes and view site check logs</p>
          </div>
        </div>
        <Button
          onClick={generateAllCodes}
          disabled={generatingAll}
          className="bg-green-700 hover:bg-green-800"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${generatingAll ? "animate-spin" : ""}`} />
          {generatingAll ? "Generating..." : "Generate All Today's Codes"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search supervisor..."
            value={searchSupervisor}
            onChange={(e) => setSearchSupervisor(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          value={searchDate}
          onChange={(e) => setSearchDate(e.target.value)}
          className="md:w-48"
        />
      </div>

      <Tabs defaultValue="codes">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="codes">Daily Codes ({filteredCodes.length})</TabsTrigger>
          <TabsTrigger value="logs">Site Check Logs ({filteredChecks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="codes">
          <Card className="border-none shadow-md">
            <CardContent className="p-4">
              {loadingCodes ? (
                <div className="text-center py-8 text-slate-400">Loading...</div>
              ) : filteredCodes.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                  <p>No codes found for {searchDate}.</p>
                  <p className="text-sm mt-1">Click "Generate All Today's Codes" to create them.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCodes.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {c.supervisor_rank && `${c.supervisor_rank} `}{c.supervisor_last_name || c.supervisor_email}
                        </p>
                        <p className="text-xs text-slate-400">{c.supervisor_email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`text-2xl font-mono font-bold tracking-widest px-4 py-1 rounded-lg border-2 ${c.is_active ? "bg-green-50 border-green-300 text-green-900" : "bg-slate-100 border-slate-300 text-slate-400 line-through"}`}>
                          {c.code}
                        </div>
                        <Badge variant="outline" className={c.is_active ? "border-green-400 text-green-700 bg-green-50" : "border-slate-300 text-slate-500"}>
                          {c.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Code copied!"); }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        {c.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deactivateCodeMutation.mutate(c.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="border-none shadow-md">
            <CardContent className="p-4">
              {loadingChecks ? (
                <div className="text-center py-8 text-slate-400">Loading...</div>
              ) : sortedChecks.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>No site checks logged for {searchDate}.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedChecks.map((check) => (
                    <div key={check.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      {check.action_type === "arrival" ? (
                        <ArrowDownToLine className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <ArrowUpFromLine className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{check.dar_entry_text}</p>
                        <div className="flex flex-wrap gap-3 mt-1">
                          <span className="text-xs text-slate-500">📍 {check.site_name}</span>
                          <span className="text-xs text-slate-500">🕐 {format(new Date(check.check_timestamp), "MMM d, h:mm a")}</span>
                          <span className="text-xs text-slate-500">👮 Entered by: {check.entered_by_officer_name}</span>
                          <span className="text-xs text-slate-400">Code: ••••</span>
                        </div>
                        {check.note && <p className="text-xs text-slate-500 mt-1 italic">Note: {check.note}</p>}
                      </div>
                      <Badge
                        variant="outline"
                        className={check.action_type === "arrival" ? "border-green-300 text-green-700 bg-green-50" : "border-red-300 text-red-700 bg-red-50"}
                      >
                        {check.action_type}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}