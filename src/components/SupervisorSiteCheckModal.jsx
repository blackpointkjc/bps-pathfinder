import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, AlertTriangle, CheckCircle2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { format } from "date-fns";

export default function SupervisorSiteCheckModal({ isOpen, onClose, location, currentEntries, onEntryAdded, officerName, officerEmail }) {
  const [code, setCode] = useState("");
  const [actionType, setActionType] = useState("arrival");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const handleSubmit = async () => {
    if (code.length !== 4 || !/^\d{4}$/.test(code)) {
      setError("Please enter a valid 4-digit code.");
      return;
    }
    if (!location) {
      setError("Please select a site location on the DAR before using Supervisor Site Check.");
      return;
    }

    setLoading(true);
    setError("");

    const response = await base44.functions.invoke("validateSupervisorCode", {
      code,
      action_type: actionType,
      site_name: location,
      note,
    });

    setLoading(false);

    if (!response.data.valid) {
      setError(response.data.error || "Invalid supervisor code.");
      return;
    }

    const { entry_text, timestamp } = response.data;
    const entryTime = format(new Date(timestamp), "HH:mm");

    onEntryAdded({ time: entryTime, text: entry_text });
    setSuccess({ entry_text, action: actionType });
  };

  const handleClose = () => {
    setCode("");
    setActionType("arrival");
    setNote("");
    setError("");
    setSuccess(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-800">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Supervisor Site Check
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 p-6 bg-green-50 rounded-xl border border-green-200">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
              <p className="text-center font-semibold text-green-900 text-lg">
                {success.action === "arrival" ? "Arrival Logged" : "Departure Logged"}
              </p>
              <p className="text-center text-sm text-green-800 bg-white px-4 py-2 rounded-lg border border-green-200">
                {success.entry_text}
              </p>
              <p className="text-xs text-green-600">Entry has been added to your DAR automatically.</p>
            </div>
            <Button onClick={handleClose} className="w-full bg-green-700 hover:bg-green-800">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {!location && (
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  Please select a site location on your DAR first.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Supervisor Code</Label>
              <Input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter 4-digit code"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="text-center text-2xl tracking-[0.5em] font-mono"
                autoFocus
              />
              <p className="text-xs text-slate-400 text-center">Ask the supervisor for their daily code</p>
            </div>

            <div className="space-y-2">
              <Label>Action Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActionType("arrival")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    actionType === "arrival"
                      ? "border-green-500 bg-green-50 text-green-800"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <ArrowDownToLine className="w-6 h-6" />
                  <span className="font-semibold text-sm">Arrival</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActionType("departure")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    actionType === "departure"
                      ? "border-red-500 bg-red-50 text-red-800"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <ArrowUpFromLine className="w-6 h-6" />
                  <span className="font-semibold text-sm">Departure</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note (Optional)</Label>
              <Textarea
                placeholder="Any additional notes..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>

            {error && (
              <Alert className="border-red-300 bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-red-800 text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || code.length !== 4 || !location}
                className="flex-1 bg-green-700 hover:bg-green-800"
              >
                {loading ? "Verifying..." : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}