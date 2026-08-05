import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

export default function OfficerPayroll() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md">
        <CardContent className="p-8 text-center">
          <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-400" />
          <h2 className="text-2xl font-bold mb-2 text-slate-900">Page Hidden</h2>
          <p className="text-slate-600">This page is no longer available.</p>
        </CardContent>
      </Card>
    </div>
  );
}