import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Building2, Users, DollarSign, TrendingUp, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function VendorDashboard() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: () => base44.entities.Vendor.list(),
    initialData: [],
  });

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list(),
    initialData: [],
  });

  const { data: vendorMembers } = useQuery({
    queryKey: ['vendorMembers'],
    queryFn: () => base44.entities.VendorMember.list(),
    initialData: [],
  });

  // Check if current user is vendor member
  const isVendorMember = vendorMembers.some(vm => 
    vm.user_email === user?.email && vm.status === 'active'
  );

  if (!isVendorMember) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-amber-600" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-600">You don't have vendor portal access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeTenants = tenants.filter(t => t.status === 'active');
  const suspendedTenants = tenants.filter(t => t.status === 'suspended');
  const trialTenants = tenants.filter(t => t.status === 'trial');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-slate-900">Vendor Portal</h1>
                <p className="text-slate-600">Multi-Tenant Platform Management</p>
              </div>
            </div>
            <Link to={createPageUrl("VendorTenants")}>
              <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700">
                <Plus className="w-4 h-4 mr-2" />
                New Client Company
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Total Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-slate-900">{tenants.length}</p>
                  <p className="text-sm text-green-600 mt-1">↑ Active: {activeTenants.length}</p>
                </div>
                <Building2 className="w-10 h-10 text-blue-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Active Tenants</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-slate-900">{activeTenants.length}</p>
                  <p className="text-sm text-slate-600 mt-1">Fully operational</p>
                </div>
                <TrendingUp className="w-10 h-10 text-green-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Trial Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-slate-900">{trialTenants.length}</p>
                  <p className="text-sm text-amber-600 mt-1">Need conversion</p>
                </div>
                <Users className="w-10 h-10 text-amber-500 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Suspended</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-slate-900">{suspendedTenants.length}</p>
                  <p className="text-sm text-red-600 mt-1">Require attention</p>
                </div>
                <Shield className="w-10 h-10 text-red-500 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link to={createPageUrl("VendorTenants")}>
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-500">
              <CardContent className="p-6">
                <Building2 className="w-12 h-12 text-blue-600 mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">Manage Clients</h3>
                <p className="text-slate-600">Create, edit, and configure client companies</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("VendorUsers")}>
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-green-500">
              <CardContent className="p-6">
                <Users className="w-12 h-12 text-green-600 mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">Vendor Staff</h3>
                <p className="text-slate-600">Manage internal team and permissions</p>
              </CardContent>
            </Card>
          </Link>

          <Link to={createPageUrl("VendorAudit")}>
            <Card className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-purple-500">
              <CardContent className="p-6">
                <Shield className="w-12 h-12 text-purple-600 mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">Audit Logs</h3>
                <p className="text-slate-600">Track all vendor and tenant activities</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Tenants */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent Client Companies</CardTitle>
          </CardHeader>
          <CardContent>
            {tenants.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-600 mb-4">No client companies yet</p>
                <Link to={createPageUrl("VendorTenants")}>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Client
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {tenants.slice(0, 5).map(tenant => (
                  <Link key={tenant.id} to={createPageUrl("VendorTenants")}>
                    <div className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold">
                          {tenant.display_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{tenant.display_name}</p>
                          <p className="text-sm text-slate-600">/c/{tenant.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          tenant.status === 'active' ? 'bg-green-100 text-green-700' :
                          tenant.status === 'trial' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {tenant.status}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}