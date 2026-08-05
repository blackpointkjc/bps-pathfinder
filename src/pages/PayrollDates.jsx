import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Calendar, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69503da793f3e1140bbd4426/633448562_UntitledProject.png";

export default function PayrollDates() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: payrollPeriods } = useQuery({
    queryKey: ['payrollPeriods'],
    queryFn: async () => {
      const periods = await base44.entities.PayrollPeriod.list('-start_date');
      return periods;
    },
  });

  const getCurrentPeriod = () => {
    if (!payrollPeriods) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    return payrollPeriods.find(p => p.start_date <= today && p.end_date >= today);
  };

  const getUpcomingPeriods = () => {
    if (!payrollPeriods) return [];
    const today = format(new Date(), 'yyyy-MM-dd');
    return payrollPeriods
      .filter(p => p.start_date > today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 10);
  };

  const currentPeriod = getCurrentPeriod();
  const upcomingPeriods = getUpcomingPeriods();

  return (
    <div className="p-4 md:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <img src={LOGO_URL} alt="Virtus Security" className="w-16 h-16 object-contain" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Payroll Direct Deposit Dates</h1>
            <p className="text-slate-600">View payroll schedule and deposit dates</p>
          </div>
        </div>

        {currentPeriod && (
          <Card className="border-none shadow-lg bg-gradient-to-r from-emerald-100 to-green-100 border-2 border-emerald-400">
            <CardHeader>
              <CardTitle className="text-black flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-emerald-700" />
                Current Payroll Period
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <p className="text-slate-700 text-sm">Period</p>
                  <p className="text-2xl font-bold text-black">{currentPeriod.period_name}</p>
                </div>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-slate-700 text-sm">Pay Period</p>
                    <p className="text-lg font-semibold text-black">
                      {format(parseISO(currentPeriod.start_date), 'MMM d')} - {format(parseISO(currentPeriod.end_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-700 text-sm">💰 Direct Deposit Date</p>
                    <p className="text-lg font-semibold text-black">
                      {format(parseISO(currentPeriod.deposit_date), 'EEEE, MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Upcoming Payroll Periods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingPeriods.map((period) => (
                <div
                  key={period.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                        {period.period_name}
                      </Badge>
                      <p className="text-sm text-slate-600">
                        {format(parseISO(period.start_date), 'MMM d')} - {format(parseISO(period.end_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-semibold text-emerald-700">
                        Deposit: {format(parseISO(period.deposit_date), 'EEEE, MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-lg bg-blue-50">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 mt-1" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-2">Important Payroll Information</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Each pay period is 14 days (2 weeks)</li>
                  <li>• <strong>Overtime:</strong> Calculated per week (Sunday-Saturday) - any hours over 40 in a 7-day week</li>
                  <li>• <strong>Holiday Pay:</strong> Federal holidays (New Year's, MLK Jr. Day, Juneteenth, July 4th, Thanksgiving, Christmas) paid at 1.25x rate</li>
                  <li>• Direct deposits are processed on the deposit date shown</li>
                  <li>• Make sure to submit your time entries by the end of each pay period</li>
                  <li>• Contact the office if you have any questions about your payroll</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}