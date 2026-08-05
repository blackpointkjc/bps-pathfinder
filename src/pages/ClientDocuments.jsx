import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BookOpen, Shield, AlertTriangle, Phone, MapPin, Users, Clock, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ClientDocuments() {
  const [expandedOrders, setExpandedOrders] = useState({});

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const clientLocations = user?.assigned_locations || (user?.assigned_location ? [user.assigned_location] : []);

  const { data: documents = [] } = useQuery({
    queryKey: ['postOrders', clientLocations],
    queryFn: async () => {
      const allPostOrders = await base44.entities.PostOrder.list('-created_date');
      return allPostOrders.filter(order => clientLocations.includes(order.site_name));
    },
    enabled: clientLocations.length > 0,
  });

  const { data: generalSections = [] } = useQuery({
    queryKey: ['generalPostOrders'],
    queryFn: () => base44.entities.GeneralPostOrder.list('sort_order'),
  });

  const toggleExpand = (id) => setExpandedOrders(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="p-4 md:p-8 min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Post Orders</h1>
            <p className="text-slate-600">Site-specific post orders and operational guidelines</p>
          </div>
        </div>

        {documents.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center text-slate-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No post orders available for your location</p>
            </CardContent>
          </Card>
        )}

        {documents.map((order) => {
          const isExpanded = expandedOrders[order.id];
          return (
            <div key={order.id} className="space-y-4">
              {/* Site Header Card */}
              <Card className="border-none shadow-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Shield className="w-7 h-7" />
                    {order.site_name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {order.site_address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{order.site_address}</span>
                    </div>
                  )}
                  <Badge className={`${
                    order.post_type === 'armed' ? 'bg-red-600' :
                    order.post_type === 'concealed_carry' ? 'bg-orange-600' :
                    'bg-green-600'
                  } text-white text-base px-4 py-1 mt-1`}>
                    {order.post_type === 'armed' ? 'ARMED POST' :
                     order.post_type === 'concealed_carry' ? 'CONCEALED CARRY' :
                     'UNARMED POST'}
                  </Badge>
                </CardContent>
              </Card>

              {/* Contacts */}
              <Card className="border-none shadow-lg">
                <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="w-5 h-5 text-green-600" />
                    Contacts
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {order.property_manager_name && (
                      <div>
                        <p className="text-sm font-semibold text-slate-600">Property Manager</p>
                        <p className="text-slate-900 font-medium">{order.property_manager_name}</p>
                        {order.property_manager_phone && (
                          <a href={`tel:${order.property_manager_phone}`} className="text-green-600 flex items-center gap-1 text-sm mt-0.5">
                            <Phone className="w-3 h-3" />{order.property_manager_phone}
                          </a>
                        )}
                      </div>
                    )}
                    {order.maintenance_contact && (
                      <div>
                        <p className="text-sm font-semibold text-slate-600">Maintenance Contact</p>
                        <a href={`tel:${order.maintenance_contact}`} className="text-green-600 flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" />{order.maintenance_contact}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-3 bg-red-50 rounded-lg border-2 border-red-300">
                      <p className="text-sm font-semibold text-red-900 mb-1">Emergency Police</p>
                      <a href={`tel:${order.emergency_police || '911'}`} className="text-2xl font-bold text-red-600">
                        {order.emergency_police || '911'}
                      </a>
                    </div>
                    {order.non_emergency_police && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm font-semibold text-blue-900 mb-1">Non-Emergency Police</p>
                        <a href={`tel:${order.non_emergency_police}`} className="text-xl font-bold text-blue-600">
                          {order.non_emergency_police}
                        </a>
                      </div>
                    )}
                  </div>
                  {order.police_precinct_address && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-sm font-semibold text-slate-700 mb-1">Police Precinct</p>
                      <p className="text-slate-900">{order.police_precinct_address}</p>
                    </div>
                  )}
                  {order.additional_contacts && (
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-sm font-semibold text-purple-900 mb-1">Additional Contacts</p>
                      <p className="text-slate-900 whitespace-pre-wrap">{order.additional_contacts}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Site-Specific Details */}
              {(order.site_overview || order.patrol_schedule || order.patrol_areas || order.special_duties || order.special_instructions || order.access_codes) && (
                <Card className="border-none shadow-lg">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MapPin className="w-5 h-5 text-blue-600" />
                      Site-Specific Instructions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {order.access_codes && (
                      <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                        <p className="text-sm font-semibold text-amber-900 mb-1">Access Codes</p>
                        <p className="text-slate-900 font-mono">{order.access_codes}</p>
                      </div>
                    )}
                    {order.site_overview && (
                      <div>
                        <p className="text-sm font-semibold text-slate-700 mb-2">Site Overview</p>
                        <p className="text-slate-900 whitespace-pre-wrap text-sm leading-relaxed">{order.site_overview}</p>
                      </div>
                    )}
                    {order.patrol_schedule && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                            <Clock className="w-4 h-4" />Patrol Schedule
                          </p>
                          <p className="text-slate-900 whitespace-pre-wrap text-sm leading-relaxed">{order.patrol_schedule}</p>
                        </div>
                      </>
                    )}
                    {order.patrol_areas && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-sm font-semibold text-slate-700 mb-2">Patrol Areas</p>
                          <p className="text-slate-900 whitespace-pre-wrap text-sm leading-relaxed">{order.patrol_areas}</p>
                        </div>
                      </>
                    )}
                    {order.special_duties && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-sm font-semibold text-slate-700 mb-2">Special Duties</p>
                          <p className="text-slate-900 whitespace-pre-wrap text-sm leading-relaxed">{order.special_duties}</p>
                        </div>
                      </>
                    )}
                    {order.special_instructions && (
                      <>
                        <Separator />
                        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                          <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />Important Instructions
                          </p>
                          <p className="text-slate-900 whitespace-pre-wrap text-sm leading-relaxed">{order.special_instructions}</p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* General Post Orders (collapsible) */}
              {generalSections.length > 0 && (
                <Card className="border-none shadow-lg border-4 border-slate-700">
                  <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-900 text-white cursor-pointer" onClick={() => toggleExpand(order.id)}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2 text-white">
                        <Shield className="w-5 h-5" />
                        General Post Orders & Emergency Action Plan
                      </CardTitle>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
                    </div>
                    <p className="text-sm text-slate-300 mt-1">Click to {isExpanded ? 'collapse' : 'expand'} general post orders</p>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="p-6 space-y-6">
                      {generalSections.filter(s => s.active).map((section, idx) => (
                        <div key={section.id}>
                          {idx > 0 && <Separator className="mb-4" />}
                          <h3 className="font-bold text-base text-slate-900 mb-2">{section.section_title}</h3>
                          <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">{section.content}</p>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}