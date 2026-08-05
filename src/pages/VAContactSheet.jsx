import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Printer, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f1b301ffd861a28ee36033/866f68856_c3ff2618-4412-4498-8923-8f484a9469b8-2533645741.jpeg";

const RANK_ORDER = {
  "Operations Manager": 1,
  "Supervisor": 2,
  "Captain": 3,
  "Lieutenant": 4,
  "Sergeant": 5,
  "Corporal": 6,
  "Armed Officer": 7,
  "Unarmed Officer": 8
};

export default function VAContactSheet() {
  const { data: allUsers, isLoading } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => base44.entities.User.list(),
  });

  const handlePrint = () => {
    window.print();
  };

  const groupByDivision = () => {
    if (!allUsers) return {};
    
    const grouped = {};
    allUsers
      .filter(user => user.division && !user.termination_date)
      .forEach(user => {
        const division = user.division;
        if (!grouped[division]) {
          grouped[division] = [];
        }
        grouped[division].push(user);
      });

    Object.keys(grouped).forEach(division => {
      grouped[division].sort((a, b) => {
        const unitA = a.unit_number ? parseInt(a.unit_number) || 9999 : 9999;
        const unitB = b.unit_number ? parseInt(b.unit_number) || 9999 : 9999;
        if (unitA !== unitB) return unitA - unitB;
        
        const rankA = RANK_ORDER[a.rank] || 999;
        const rankB = RANK_ORDER[b.rank] || 999;
        if (rankA !== rankB) return rankA - rankB;
        
        return (a.last_name || '').localeCompare(b.last_name || '');
      });
    });

    return grouped;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), 'MM/dd/yyyy');
    } catch {
      return dateString;
    }
  };

  const getExpirationStatus = (dateString) => {
    if (!dateString || dateString === "N/A") return null;
    try {
      const expDate = new Date(dateString);
      const daysUntil = differenceInDays(expDate, new Date());
      if (daysUntil < 0) return "expired";
      if (daysUntil <= 30) return "warning";
      return "valid";
    } catch {
      return null;
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Users className="w-16 h-16 mx-auto mb-4 text-slate-400 animate-pulse" />
        <p className="text-slate-600">Loading contact information...</p>
      </div>
    );
  }

  const divisionData = groupByDivision();
  const sortedDivisions = Object.keys(divisionData).sort();

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <div className="max-w-full mx-auto space-y-8">
        <div className="flex justify-between items-center print:mb-8">
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="Virtus Security" className="w-16 h-16 object-contain" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">VA Contact Sheet</h1>
              <p className="text-slate-600">Complete officer directory by division</p>
            </div>
          </div>
          <Button
            onClick={handlePrint}
            variant="outline"
            className="print:hidden"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>

        <div className="space-y-8">
          {sortedDivisions.map((division) => (
            <div key={division} className="print:page-break-inside-avoid">
              <div className="text-center mb-6 print:mb-4">
                <img src={LOGO_URL} alt="Virtus Security" className="w-32 h-32 mx-auto mb-4 print:w-24 print:h-24" />
                <h2 className="text-2xl font-bold text-slate-900 print:text-xl">{division}</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-blue-400">
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Officer</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Rank</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Email</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Mobile</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Badge #</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Unit #</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Hire Date</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">DCJS Exp.</th>
                      <th className="border-2 border-slate-900 p-2 text-left font-bold text-white">Firearm Exp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divisionData[division].map((officer, idx) => {
                      const dcjsStatus = getExpirationStatus(officer.dcjs_expiration);
                      const firearmStatus = getExpirationStatus(officer.firearm_expiration);
                      
                      return (
                        <tr key={officer.id} className={idx % 2 === 0 ? 'bg-blue-100' : 'bg-white'}>
                          <td className="border-2 border-slate-900 p-2 font-semibold">
                            {officer.last_name}, {officer.first_name}
                          </td>
                          <td className="border-2 border-slate-900 p-2">{officer.rank || 'N/A'}</td>
                          <td className="border-2 border-slate-900 p-2">
                            <a href={`mailto:${officer.email}`} className="text-blue-700 underline print:text-blue-700 flex items-center gap-1">
                              <Mail className="w-3 h-3 print:hidden" />
                              {officer.email}
                            </a>
                          </td>
                          <td className="border-2 border-slate-900 p-2">
                            <a 
                              href={`tel:${officer.phone}`} 
                              className="text-blue-700 underline flex items-center gap-1 print:text-slate-900"
                            >
                              <Phone className="w-3 h-3 print:hidden" />
                              {officer.phone || 'N/A'}
                            </a>
                          </td>
                          <td className="border-2 border-slate-900 p-2">{officer.badge_number || 'N/A'}</td>
                          <td className="border-2 border-slate-900 p-2">{officer.unit_number || 'N/A'}</td>
                          <td className="border-2 border-slate-900 p-2">{formatDate(officer.hire_date)}</td>
                          <td className={`border-2 border-slate-900 p-2 ${
                            dcjsStatus === 'expired' ? 'bg-red-200 text-red-900 font-bold' :
                            dcjsStatus === 'warning' ? 'bg-amber-200 text-amber-900 font-bold' : ''
                          }`}>
                            {formatDate(officer.dcjs_expiration)}
                          </td>
                          <td className={`border-2 border-slate-900 p-2 ${
                            firearmStatus === 'expired' ? 'bg-red-200 text-red-900 font-bold' :
                            firearmStatus === 'warning' ? 'bg-amber-200 text-amber-900 font-bold' : ''
                          }`}>
                            {formatDate(officer.firearm_expiration)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {sortedDivisions.length === 0 && (
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 text-center">
              <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No officers found with division assignments.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 0.3in;
          }
          
          body * {
            visibility: hidden;
          }
          
          .max-w-full, .max-w-full * {
            visibility: visible;
          }
          
          .max-w-full {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            padding: 0 !important;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          table {
            font-size: 9px !important;
          }
          
          th, td {
            padding: 3px !important;
          }
          
          .bg-blue-400 {
            background-color: rgb(96, 165, 250) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .bg-blue-100 {
            background-color: rgb(219, 234, 254) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .bg-red-200 {
            background-color: rgb(254, 202, 202) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .bg-amber-200 {
            background-color: rgb(253, 230, 138) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .text-white {
            color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .border-slate-900 {
            border-color: rgb(15, 23, 42) !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .print\\:text-blue-700 {
            color: rgb(29, 78, 216) !important;
          }
          
          .print\\:text-slate-900 {
            color: rgb(15, 23, 42) !important;
          }
          
          table {
            page-break-inside: auto;
          }
          
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          .print\\:page-break-inside-avoid {
            page-break-inside: avoid;
          }
          
          .print\\:mb-4 {
            margin-bottom: 1rem !important;
          }
          
          .print\\:text-xl {
            font-size: 1.25rem !important;
          }
          
          .print\\:w-24 {
            width: 6rem !important;
          }
          
          .print\\:h-24 {
            height: 6rem !important;
          }
        }
      `}</style>
    </div>
  );
}