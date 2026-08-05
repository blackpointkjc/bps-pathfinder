import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function VendorLogin() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // In real implementation, this would check VendorMember status
      await base44.auth.redirectToLogin(createPageUrl("VendorDashboard"));
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed. Please try again.");
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <Card className="w-full max-w-md border-none shadow-2xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              Vendor Portal
            </CardTitle>
            <p className="text-slate-600 mt-2">Master Platform Access</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vendor@company.com"
                required
                className="h-12"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-lg"
              disabled={loading}
            >
              {loading ? "Logging in..." : (
                <>
                  Access Vendor Portal
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>
          
          <div className="mt-6 pt-6 border-t text-center">
            <p className="text-sm text-slate-500">
              Client company portal? Use your tenant-specific link
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}