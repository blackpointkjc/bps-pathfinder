import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Users, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function RankStructure() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allUsers } = useQuery({
    queryKey: ['allUsersRank'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
  });

  const supervisoryRanks = [
    "Colonel",
    "Lt Colonel",
    "Major",
    "Captain",
    "Lieutenant",
    "First Sergeant",
    "Sergeant",
    "Corporal",
  ];
  const lineRanks = ["Senior officer", "Officer", "Unarmed Officer"];

  // Display label (short title) and unit range for each rank
  const rankDisplayLabel = {
    "Colonel": "Colonel",
    "Lt Colonel": "Lt. Colonel",
    "Major": "Major",
    "Captain": "Captain",
    "Lieutenant": "Lieutenant",
    "First Sergeant": "First Sergeant",
    "Sergeant": "Sergeant",
    "Corporal": "Corporal",
    "Senior officer": "Senior Officer",
    "Officer": "Officer",
    "Unarmed Officer": "Unarmed Officer",
  };

  const rankUnitRange = {
    "Captain": "Unit #350",
    "Lieutenant": "Unit #400",
    "First Sergeant": "Unit #450",
    "Sergeant": "Unit #500",
    "Corporal": "Unit #550",
    "Senior officer": "Unit #600",
    "Officer": "Unit #650",
    "Unarmed Officer": "Unit #700",
  };

  const getUsersByRank = (rank) => {
    const officers = allUsers?.filter(u => u.rank === rank && !u.termination_date) || [];
    
    // Sort by unit number
    return officers.sort((a, b) => {
      const unitA = a.unit_number;
      const unitB = b.unit_number;
      
      if (unitA && unitB) {
        const numA = parseInt(unitA);
        const numB = parseInt(unitB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return unitA.localeCompare(unitB);
      }
      
      if (unitA && !unitB) return -1;
      if (!unitA && unitB) return 1;
      
      // If no unit numbers, sort by name
      const nameA = `${a.first_name} ${a.last_name}`;
      const nameB = `${b.first_name} ${b.last_name}`;
      return nameA.localeCompare(nameB);
    });
  };

  const getRankColor = (rank) => {
    switch (rank) {
      case "Colonel": return "bg-amber-100 text-amber-900 border-amber-400";
      case "Lt Colonel": return "bg-rose-100 text-rose-900 border-rose-400";
      case "Major": return "bg-red-100 text-red-800 border-red-300";
      case "Captain": return "bg-orange-100 text-orange-800 border-orange-300";
      case "Lieutenant": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "First Sergeant": return "bg-lime-100 text-lime-800 border-lime-300";
      case "Sergeant": return "bg-green-100 text-green-800 border-green-300";
      case "Corporal": return "bg-blue-100 text-blue-800 border-blue-300";
      case "Senior officer": return "bg-purple-100 text-purple-800 border-purple-300";
      case "Officer": return "bg-indigo-100 text-indigo-800 border-indigo-300";
      case "Unarmed Officer": return "bg-slate-100 text-slate-800 border-slate-300";
      default: return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Admin Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
          <Shield className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Rank Structure</h1>
          <p className="text-slate-600">Organizational hierarchy pyramid</p>
        </div>

        {/* Pyramid Structure */}
        <div className="space-y-4">
          {supervisoryRanks.map((rank, index) => {
            const officers = getUsersByRank(rank);
            const widthPercent = 30 + (index * 10);
            
            return (
              <div key={rank} className="flex flex-col items-center">
                <div style={{ width: `${widthPercent}%` }} className="min-w-[300px] max-w-full">
                  <Card className="border-none shadow-lg hover:shadow-xl transition-shadow bg-white">
                    <CardHeader className="pb-3">
                      <div className="text-center">
                        <Badge className={`${getRankColor(rank)} text-base font-bold px-4 py-2 mb-2`}>
                          {rankDisplayLabel[rank] || rank}
                        </Badge>
                        {rankUnitRange[rank] && (
                          <p className="text-xs text-slate-500 font-medium">{rankUnitRange[rank]}</p>
                        )}
                        <p className="text-xs text-slate-500">({officers.length} personnel)</p>
                      </div>
                    </CardHeader>
                    {officers.length > 0 && (
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {officers.map((officer) => (
                            <div key={officer.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                              {officer.profile_photo_url ? (
                                <img
                                  src={officer.profile_photo_url}
                                  alt={`${officer.first_name} ${officer.last_name}`}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                                  {officer.first_name?.charAt(0)}{officer.last_name?.charAt(0)}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">
                                  {officer.first_name} {officer.last_name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                  {officer.unit_number && <span>Unit #{officer.unit_number}</span>}
                                  {officer.division && <span>• {officer.division}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                </div>
              </div>
            );
          })}

          {/* Line Officers Section */}
          <div className="pt-8">
            <div className="text-center mb-4">
              <Badge className="bg-purple-600 text-white text-base px-4 py-2">Line Officers</Badge>
            </div>
            {lineRanks.map((rank, index) => {
              const officers = getUsersByRank(rank);
              const widthPercent = 70 + (index * 10);
              
              return (
                <div key={rank} className="flex flex-col items-center mb-4">
                  <div style={{ width: `${widthPercent}%` }} className="min-w-[300px] max-w-full">
                    <Card className="border-none shadow-lg hover:shadow-xl transition-shadow bg-white">
                      <CardHeader className="pb-3">
                        <div className="text-center">
                          <Badge className={`${getRankColor(rank)} text-base font-bold px-4 py-2 mb-2`}>
                            {rankDisplayLabel[rank] || rank}
                          </Badge>
                          {rankUnitRange[rank] && (
                            <p className="text-xs text-slate-500 font-medium">{rankUnitRange[rank]}</p>
                          )}
                          <p className="text-xs text-slate-500">({officers.length} personnel)</p>
                        </div>
                      </CardHeader>
                      {officers.length > 0 && (
                        <CardContent className="pt-0">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {officers.map((officer) => (
                              <div key={officer.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                {officer.profile_photo_url ? (
                                  <img
                                    src={officer.profile_photo_url}
                                    alt={`${officer.first_name} ${officer.last_name}`}
                                    className="w-8 h-8 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                    {officer.first_name?.charAt(0)}{officer.last_name?.charAt(0)}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 truncate">
                                    {officer.first_name} {officer.last_name}
                                  </p>
                                  {officer.unit_number && (
                                    <p className="text-xs text-slate-500">#{officer.unit_number}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hierarchy Summary */}
        <Card className="border-none shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 mt-8">
          <CardContent className="p-6">
            <h3 className="font-bold text-blue-900 mb-4 text-center text-lg">Chain of Command</h3>
            <div className="space-y-3 text-sm text-blue-800">
              <div className="text-center">
                <p className="font-semibold mb-2">Executive Leadership</p>
                <p>Colonel → Lt Colonel → Major</p>
              </div>
              <div className="text-center pt-3 border-t border-blue-200">
                <p className="font-semibold mb-2">Field Supervision</p>
                <p>Captain → Lieutenant → First Sergeant → Sergeant → Corporal</p>
              </div>
              <div className="text-center pt-3 border-t border-blue-200">
                <p className="font-semibold mb-2">Line Personnel</p>
                <p>Senior officer → Officer → Unarmed Officer</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}