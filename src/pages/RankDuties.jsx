import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, ClipboardCheck, UserCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export default function RankDuties() {
  const [expandedRank, setExpandedRank] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const ranks = [
    {
      rank: "Captain / Operations Manager",
      unitSeries: "100-199",
      color: "bg-red-600",
      duties: [
        "Overall operational oversight of security operations",
        "Strategic planning and implementation of security protocols",
        "Budget management and resource allocation",
        "Client relationship management and contract oversight",
        "Performance reviews and disciplinary actions",
        "Emergency response coordination and crisis management",
        "Liaison with law enforcement and emergency services",
        "Policy development and compliance oversight",
        "Training program development and implementation",
        "Quality assurance and performance metrics analysis"
      ]
    },
    {
      rank: "Lieutenant / Operations Supervisor / Compliance Agent",
      unitSeries: "200-299",
      color: "bg-orange-600",
      duties: [
        "Daily operational supervision of field personnel",
        "Schedule coordination and shift management",
        "Compliance monitoring and regulatory adherence",
        "Incident investigation and report review",
        "Training coordination and officer development",
        "Client communication and service delivery",
        "Equipment and resource management",
        "Performance evaluations and feedback",
        "Assist in policy implementation",
        "Backup to Operations Manager"
      ]
    },
    {
      rank: "Sergeant / Field Lead Supervisor",
      unitSeries: "300-349",
      color: "bg-yellow-600",
      duties: [
        "Direct supervision of field operations",
        "Site inspections and quality control",
        "Officer performance monitoring",
        "Shift briefings and debriefings",
        "Incident response and management",
        "Training delivery and officer coaching",
        "Report review and approval",
        "Client site liaison",
        "Resolve on-site issues and conflicts",
        "Assist with scheduling and coverage"
      ]
    },
    {
      rank: "Senior Corporal / Field Supervisor",
      unitSeries: "350-399",
      color: "bg-lime-600",
      duties: [
        "Field supervision similar to Sergeant",
        "Multi-site oversight and coordination",
        "Advanced incident response",
        "Officer mentoring and development",
        "Quality assurance checks",
        "Client interaction and issue resolution",
        "Assist with training programs",
        "Report review and guidance",
        "Coverage for Sergeant absences",
        "Special project leadership"
      ]
    },
    {
      rank: "Corporal / Site Supervisor",
      unitSeries: "400-449",
      color: "bg-green-600",
      duties: [
        "On-site supervision of security personnel",
        "Shift coordination and officer deployment",
        "Daily site inspections and walkthroughs",
        "Immediate incident response",
        "Officer guidance and support",
        "Client interaction at assigned site",
        "Report verification and submission",
        "Equipment checks and maintenance coordination",
        "Officer performance documentation",
        "Enforce company policies and procedures"
      ]
    },
    {
      rank: "Senior Officer / Lead Officer",
      unitSeries: "450-499",
      color: "bg-blue-600",
      duties: [
        "Lead shifts in absence of Corporal",
        "Act as Corporal at direction of Sergeant",
        "Officer in charge responsibilities",
        "Training and mentoring junior officers",
        "Advanced post assignments",
        "Quality control and compliance checks",
        "Assist supervisors with administrative tasks",
        "Special duty assignments",
        "Backup supervision when needed",
        "Represent security team to clients"
      ]
    },
    {
      rank: "Armed Officer",
      unitSeries: "500-599",
      color: "bg-purple-600",
      duties: [
        "Patrol assigned areas and properties",
        "Access control and visitor screening",
        "Incident detection and response",
        "Report writing and documentation",
        "Client service and assistance",
        "Emergency response procedures",
        "Firearm proficiency and safety",
        "Law enforcement liaison",
        "Radio communication and coordination",
        "Follow all security protocols"
      ]
    },
    {
      rank: "Unarmed Officer",
      unitSeries: "600-699",
      color: "bg-slate-600",
      duties: [
        "Patrol and observation duties",
        "Access control and monitoring",
        "Incident reporting and documentation",
        "Customer service and assistance",
        "Safety and security checks",
        "Radio communication",
        "Follow security procedures",
        "Maintain professional appearance",
        "Report safety hazards",
        "Assist with site-specific duties"
      ]
    },
    {
      rank: "Special Conservator",
      unitSeries: "700-799",
      color: "bg-indigo-600",
      duties: [
        "Specialized security assignments",
        "Courtroom security and bailiff duties",
        "Prisoner transport and custody",
        "High-security event coverage",
        "Executive protection details",
        "Special investigation support",
        "Undercover operations when required",
        "Advanced security techniques",
        "Liaison with law enforcement agencies",
        "Specialized training and certifications"
      ]
    }
  ];

  const toggleRank = (rank) => {
    setExpandedRank(expandedRank === rank ? null : rank);
  };

  return (
    <div className="bps-command-page min-h-screen bg-[#080d16] p-4 text-white md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-600" />
          <div>
            <h1 className="text-3xl font-black text-white">Rank Structure & Duties</h1>
            <p className="text-slate-600">Security operations chain of command and responsibilities</p>
          </div>
        </div>

        <div className="grid gap-4">
          {ranks.filter(item => ["Sergeant / Field Lead Supervisor", "Senior Corporal / Field Supervisor", "Corporal / Site Supervisor", "Senior Officer / Lead Officer", "Armed Officer", "Unarmed Officer", "Special Conservator"].includes(item.rank)).map((item) => (
            <Card key={item.rank} className="border-none shadow-lg overflow-hidden">
              <div 
                className={`${item.color} text-white p-4 cursor-pointer hover:opacity-90 transition-opacity`}
                onClick={() => toggleRank(item.rank)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6" />
                    <div>
                      <h3 className="text-xl font-bold">{item.rank}</h3>
                      <p className="text-sm opacity-90">Unit Numbers: {item.unitSeries}</p>
                    </div>
                  </div>
                  {expandedRank === item.rank ? (
                    <ChevronUp className="w-6 h-6" />
                  ) : (
                    <ChevronDown className="w-6 h-6" />
                  )}
                </div>
              </div>
              
              {expandedRank === item.rank && (
                <CardContent className="p-6">
                  <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-slate-600" />
                    Primary Duties & Responsibilities
                  </h4>
                  <ul className="space-y-2">
                    {item.duties.map((duty, index) => (
                      <li key={index} className="flex items-start gap-3 text-slate-700">
                        <span className="text-blue-600 font-bold mt-1">•</span>
                        <span>{duty}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        <Card className="border-none shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="p-6">
            <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
              <UserCheck className="w-5 h-5" />
              Chain of Command
            </h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p className="font-semibold">Supervisory Authority:</p>
              <p className="ml-4">
                Captain → Lieutenant → Sergeant → Senior Corporal → Corporal → Senior Officer
              </p>
              <p className="font-semibold mt-4">Line Officers:</p>
              <p className="ml-4">
                Armed Officer → Unarmed Officer
              </p>
              <p className="font-semibold mt-4">Specialized Personnel:</p>
              <p className="ml-4">
                Special Conservator (Special assignments and duties)
              </p>
              <p className="text-xs text-blue-600 mt-4">
                Note: Senior Officers may assume supervisory duties at the direction of a Sergeant or higher-ranking supervisor.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}