import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Save, AlertCircle } from "lucide-react";

export default function AdminPayrollConfig() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const roles = new Set((user?.additional_roles || []).map(role => String(role).toLowerCase()));
  const hasAccountingAccess = user?.role === 'admin' || roles.has('accounting') || roles.has('full_access');

  const { data: config } = useQuery({
    queryKey: ['payrollConfig'],
    queryFn: async () => {
      const configs = await base44.entities.PayrollConfig.list();
      return configs[0] || null;
    },
  });

  const [formData, setFormData] = useState(() => config || {
    config_name: 'Default',
    employer_ein: '',
    company_legal_name: '',
    company_address: '',
    company_phone: '',
    payroll_email: '',
    overtime_threshold_hours: 40,
    overtime_multiplier: 1.5,
    holiday_multiplier: 2.0,
    federal_tax_id: '',
    state_tax_id_va: '',
    state_tax_id_md: '',
    pay_schedule: 'biweekly',
  });

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  const updateConfigMutation = useMutation({
    mutationFn: (data) => {
      if (config?.id) {
        return base44.entities.PayrollConfig.update(config.id, data);
      } else {
        return base44.entities.PayrollConfig.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollConfig'] });
      setSaving(false);
      alert('✅ Payroll configuration saved successfully!');
    },
    onError: (error) => {
      alert('❌ Error saving configuration: ' + error.message);
      setSaving(false);
    }
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: field.includes('hours') || field.includes('multiplier') ? parseFloat(value) || 0 : value
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    updateConfigMutation.mutate(formData);
  };

  if (!user || !hasAccountingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-amber-600" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-600">Accounting access required.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-8 h-8" />
            Payroll Configuration
          </h1>
          <p className="text-slate-600 mt-1">Manage company payroll settings and tax information</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="config_name">Configuration Name</Label>
              <Input
                id="config_name"
                value={formData.config_name || ''}
                onChange={(e) => handleChange('config_name', e.target.value)}
                placeholder="e.g., Default"
              />
            </div>

            <div>
              <Label htmlFor="company_legal_name">Company Legal Name *</Label>
              <Input
                id="company_legal_name"
                value={formData.company_legal_name || ''}
                onChange={(e) => handleChange('company_legal_name', e.target.value)}
              />

            </div>

            <div>
              <Label htmlFor="company_address">Company Address *</Label>
              <Input
                id="company_address"
                value={formData.company_address || ''}
                onChange={(e) => handleChange('company_address', e.target.value)}
              />

            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company_phone">Company Phone</Label>
                <Input
                  id="company_phone"
                  value={formData.company_phone || ''}
                  onChange={(e) => handleChange('company_phone', e.target.value)}
                  placeholder="e.g., 555-123-4567"
                />
              </div>

              <div>
                <Label htmlFor="payroll_email">Payroll Email</Label>
                <Input
                  id="payroll_email"
                  type="email"
                  value={formData.payroll_email || ''}
                  onChange={(e) => handleChange('payroll_email', e.target.value)}
                />
  
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tax IDs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tax Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="employer_ein">Employer Identification Number (EIN) *</Label>
              <Input
                id="employer_ein"
                value={formData.employer_ein || ''}
                onChange={(e) => handleChange('employer_ein', e.target.value)}
              />

            </div>

            <div>
              <Label htmlFor="federal_tax_id">Federal Tax Payment ID</Label>
              <Input
                id="federal_tax_id"
                value={formData.federal_tax_id || ''}
                onChange={(e) => handleChange('federal_tax_id', e.target.value)}
                placeholder="Federal tax ID"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="state_tax_id_va">Virginia State Tax ID</Label>
                <Input
                  id="state_tax_id_va"
                  value={formData.state_tax_id_va || ''}
                  onChange={(e) => handleChange('state_tax_id_va', e.target.value)}
                  placeholder="VA Tax ID"
                />
              </div>

              <div>
                <Label htmlFor="state_tax_id_md">Maryland State Tax ID</Label>
                <Input
                  id="state_tax_id_md"
                  value={formData.state_tax_id_md || ''}
                  onChange={(e) => handleChange('state_tax_id_md', e.target.value)}
                  placeholder="MD Tax ID"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payroll Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payroll Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pay_schedule">Pay Schedule</Label>
              <Select
                value={formData.pay_schedule || 'biweekly'}
                onValueChange={(val) => handleChange('pay_schedule', val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="semimonthly">Semi-monthly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="overtime_threshold">Overtime Threshold (hours)</Label>
                <Input
                  id="overtime_threshold"
                  type="number"
                  disabled
                  className="bg-slate-100 cursor-not-allowed"
                  value={formData.overtime_threshold_hours || 40}
                />
                <p className="text-xs text-slate-500 mt-1">Fixed</p>
              </div>

              <div>
                <Label htmlFor="overtime_multiplier">Overtime Multiplier</Label>
                <Input
                  id="overtime_multiplier"
                  type="number"
                  disabled
                  className="bg-slate-100 cursor-not-allowed"
                  value={formData.overtime_multiplier || 1.5}
                />
                <p className="text-xs text-slate-500 mt-1">Fixed</p>
              </div>

              <div>
                <Label htmlFor="holiday_multiplier">Holiday Multiplier</Label>
                <Input
                  id="holiday_multiplier"
                  type="number"
                  step="0.25"
                  value={formData.holiday_multiplier || 2.0}
                  onChange={(e) => handleChange('holiday_multiplier', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            Fields marked with * are required and will appear on tax forms and payroll documents.
          </AlertDescription>
        </Alert>

        <Button
          type="submit"
          disabled={saving}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-6 text-lg"
        >
          <Save className="w-5 h-5 mr-2" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </form>
    </div>
  );
}