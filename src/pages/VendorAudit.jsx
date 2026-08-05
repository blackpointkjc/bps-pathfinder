import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Activity } from "lucide-react";

export default function VendorAudit() {
  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Audit Logs</h1>
        <p className="text-slate-600">Track all vendor and tenant activities</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-12 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-slate-300" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">Audit Logging</h3>
          <p className="text-slate-500">Audit trail implementation coming soon</p>
        </CardContent>
      </Card>
    </div>
  );
}