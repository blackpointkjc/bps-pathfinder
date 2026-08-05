import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Zap, CheckCircle, Download, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function AccountingW2Generator() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);
  const [generating, setGenerating] = useState(false);

  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAccountingRole = user?.additional_roles?.includes('accounting') || user?.role === 'admin';

  const { data: payrollEntries } = useQuery({
    queryKey: ['payrollEntries'],
    queryFn: () => base44.entities.PayrollEntry.list('-pay_date', 2000),
    enabled: isAccountingRole,
    initialData: [],
  });

  const { data: officers } = useQuery({
    queryKey: ['officers'],
    queryFn: () => base44.entities.User.list(),
    initialData: [],
  });

  const { data: w2Forms } = useQuery({
    queryKey: ['w2Forms'],
    queryFn: () => base44.entities.W2Form.list('-tax_year'),
    enabled: isAccountingRole,
    initialData: [],
  });

  const { data: config } = useQuery({
    queryKey: ['payrollConfig'],
    queryFn: async () => {
      const configs = await base44.entities.PayrollConfig.list();
      return configs[0] || null;
    },
    enabled: isAccountingRole,
  });

  const generateW2Mutation = useMutation({
    mutationFn: (w2Data) => base44.entities.W2Form.bulkCreate(w2Data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['w2Forms'] });
      setGenerating(false);
      alert('✅ W-2 forms generated successfully!');
    },
    onError: (error) => {
      alert('❌ Failed to generate W-2s: ' + error.message);
      setGenerating(false);
    }
  });

  const finalizeW2Mutation = useMutation({
    mutationFn: (id) => base44.entities.W2Form.update(id, { status: 'finalized' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['w2Forms'] });
    },
  });

  const generateW2Forms = async () => {
    setGenerating(true);

    try {
      // Filter payroll for selected year
      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;
      
      const yearPayroll = payrollEntries.filter(entry => {
        return entry.pay_date >= yearStart && entry.pay_date <= yearEnd && entry.status === 'paid';
      });

      // Group by officer
      const officerTotals = {};
      
      yearPayroll.forEach(entry => {
        if (!officerTotals[entry.officer_email]) {
          officerTotals[entry.officer_email] = {
            wages: 0,
            federalTax: 0,
            stateTax: 0,
            socialSecurity: 0,
            medicare: 0
          };
        }

        officerTotals[entry.officer_email].wages += entry.gross_pay || 0;
        officerTotals[entry.officer_email].federalTax += entry.federal_tax || 0;
        officerTotals[entry.officer_email].stateTax += entry.state_tax || 0;
        officerTotals[entry.officer_email].socialSecurity += entry.social_security || 0;
        officerTotals[entry.officer_email].medicare += entry.medicare || 0;
      });

      // Create W-2 forms
      const w2Data = [];
      
      for (const [email, totals] of Object.entries(officerTotals)) {
        const officer = officers.find(o => o.email === email);
        if (!officer) continue;

        w2Data.push({
          officer_email: email,
          tax_year: selectedYear,
          wages_tips_compensation: parseFloat(totals.wages.toFixed(2)),
          federal_income_tax: parseFloat(totals.federalTax.toFixed(2)),
          social_security_wages: parseFloat(totals.wages.toFixed(2)),
          social_security_tax: parseFloat(totals.socialSecurity.toFixed(2)),
          medicare_wages: parseFloat(totals.wages.toFixed(2)),
          medicare_tax: parseFloat(totals.medicare.toFixed(2)),
          state_wages: parseFloat(totals.wages.toFixed(2)),
          state_income_tax: parseFloat(totals.stateTax.toFixed(2)),
          state: officer.work_state || 'VA',
          employer_ein: config?.employer_ein || 'Not Set',
          status: 'draft'
        });
      }

      if (w2Data.length > 0) {
        await generateW2Mutation.mutateAsync(w2Data);
      } else {
        setGenerating(false);
        alert('No paid payroll entries found for ' + selectedYear);
      }
    } catch (error) {
      console.error('W-2 generation error:', error);
      setGenerating(false);
    }
  };

  if (!isAccountingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-amber-600" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-600">You don't have accounting access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const w2ForYear = w2Forms.filter(w => w.tax_year === selectedYear);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">W-2 Generator</h1>
          <p className="text-slate-600">AI-powered W-2 form generation</p>
        </div>
      </div>

      {/* AI W-2 Generator */}
      <Card className="mb-6 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <Zap className="w-5 h-5" />
            Generate W-2 Forms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tax Year</Label>
            <Select
              value={selectedYear.toString()}
              onValueChange={(val) => setSelectedYear(parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">2026</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={generateW2Forms}
            disabled={generating}
            className="w-full bg-purple-600 hover:bg-purple-700 text-lg py-6"
          >
            {generating ? (
              <>
                <Calendar className="w-5 h-5 mr-2 animate-spin" />
                Generating W-2s...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2" />
                Generate W-2 Forms for {selectedYear}
              </>
            )}
          </Button>

          <p className="text-xs text-purple-900">
            AI will pull all paid payroll data for {selectedYear}, calculate year-end totals, and generate W-2 forms for all officers.
          </p>
        </CardContent>
      </Card>

      {/* W-2 Forms List */}
      <Card>
        <CardHeader>
          <CardTitle>Generated W-2 Forms ({w2ForYear.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {w2ForYear.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-600">No W-2 forms for {selectedYear}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {w2ForYear.map(w2 => {
                const officer = officers.find(o => o.email === w2.officer_email);
                return (
                  <div key={w2.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {officer ? `${officer.first_name} ${officer.last_name}` : w2.officer_email}
                      </p>
                      <p className="text-sm text-slate-600">
                        Wages: ${w2.wages_tips_compensation.toFixed(2)} • Withheld: ${(w2.federal_income_tax + w2.state_income_tax).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={
                        w2.status === 'finalized' ? 'bg-green-600' :
                        w2.status === 'issued' ? 'bg-blue-600' : 'bg-amber-600'
                      }>
                        {w2.status}
                      </Badge>
                      {w2.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={() => finalizeW2Mutation.mutate(w2.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Finalize
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const totalQualifiedOT = payrollEntries
                            .filter(p => p.officer_email === w2.officer_email && p.pay_date?.startsWith(w2.tax_year.toString()) && p.status === 'paid')
                            .reduce((sum, p) => sum + (p.qualified_overtime_premium || 0), 0);
                          
                          const w2Window = window.open('', '_blank');
                          w2Window.document.write(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                              <title>W-2 Form \${w2.tax_year} - \${officer?.first_name} \${officer?.last_name}</title>
                              <style>
                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                body { 
                                  font-family: Arial, sans-serif; 
                                  background: white;
                                  padding: 0.5in;
                                }
                                .w2-page {
                                  width: 8in;
                                  margin: 0 auto 0.5in auto;
                                  border: 3px solid black;
                                  page-break-after: always;
                                }
                                .w2-header {
                                  display: flex;
                                  justify-content: space-between;
                                  align-items: flex-start;
                                  padding: 6px 8px;
                                  border-bottom: 2px solid black;
                                }
                                .void-section {
                                  display: flex;
                                  align-items: center;
                                  gap: 4px;
                                }
                                .void-box {
                                  width: 12px;
                                  height: 12px;
                                  border: 1.5px solid black;
                                }
                                .void-text {
                                  font-size: 9px;
                                  font-weight: bold;
                                }
                                .ssn-box {
                                  font-size: 8px;
                                  font-weight: bold;
                                }
                                .omb-section {
                                  text-align: right;
                                  font-size: 8px;
                                }
                                .omb-title {
                                  font-weight: bold;
                                  color: #c00;
                                }
                                .w2-grid {
                                  display: grid;
                                  grid-template-columns: repeat(6, 1fr);
                                }
                                .box {
                                  border: 1px solid black;
                                  border-top: none;
                                  border-left: none;
                                  padding: 3px 5px;
                                  font-size: 7px;
                                  min-height: 32px;
                                  position: relative;
                                }
                                .box:nth-child(6n) { border-right: none; }
                                .box-label {
                                  font-weight: bold;
                                  display: block;
                                  margin-bottom: 2px;
                                  line-height: 1.2;
                                }
                                .box-value {
                                  font-size: 10px;
                                  font-weight: bold;
                                  display: block;
                                  margin-top: 2px;
                                }
                                .small-value {
                                  font-size: 8px;
                                }
                                .header-row { display: grid; grid-template-columns: 80px 1fr 200px; border-bottom: 2px solid black; }
                                .void-section { border-right: 2px solid black; padding: 4px; text-align: center; }
                                .void-box { width: 14px; height: 14px; border: 2px solid black; display: inline-block; margin-right: 4px; }
                                .void-label { font-size: 10px; font-weight: bold; }
                                .ssn-section { padding: 4px 8px; display: flex; align-items: center; }
                                .ssn-label { font-size: 7px; font-weight: bold; margin-right: 6px; }
                                .ssn-value { font-size: 9px; font-weight: bold; }
                                .omb-section { border-left: 2px solid black; padding: 4px 8px; text-align: right; }
                                .omb-label { font-size: 7px; font-weight: bold; color: #c00; }
                                .omb-value { font-size: 8px; }
                                .w2-grid { display: grid; grid-template-columns: repeat(6, 1fr); }
                                .box { border-right: 1px solid black; border-bottom: 1px solid black; padding: 3px 5px; font-size: 7px; min-height: 38px; }
                                .box:nth-child(6n) { border-right: 3px solid black; }
                                .box-label { font-weight: bold; margin-bottom: 2px; line-height: 1.1; }
                                .box-value { font-size: 10px; font-weight: bold; margin-top: 2px; }
                                .small-value { font-size: 8px; }
                                .span-2 { grid-column: span 2; }
                                .span-3 { grid-column: span 3; }
                                .span-4 { grid-column: span 4; }
                                .tall { min-height: 60px; }
                                .box-12-grid { display: flex; flex-direction: column; gap: 2px; }
                                .box-12-row { display: grid; grid-template-columns: 30px 1fr; gap: 4px; }
                                .code-label { font-size: 6px; text-align: center; }
                                .code-box { border: 1px solid black; height: 16px; text-align: center; padding-top: 2px; font-weight: bold; }
                                .box-13-content { display: flex; gap: 12px; margin-top: 4px; }
                                .checkbox-group { display: flex; align-items: center; gap: 3px; }
                                .checkbox { width: 11px; height: 11px; border: 1.5px solid black; }
                                .checkbox-label { font-size: 7px; }
                                .box-14-grid { display: grid; grid-template-rows: 1fr auto; gap: 2px; }
                                .footer { padding: 8px; border-top: 3px solid black; display: flex; justify-content: space-between; align-items: center; }
                                .footer-text { font-size: 8px; flex: 1; }
                                .footer-title { font-weight: bold; font-size: 11px; }
                                .footer-year { font-size: 32px; font-weight: bold; }
                                .department { font-size: 7px; text-align: right; margin-top: 2px; }
                                @media print {
                                  body { padding: 0; }
                                  @page { margin: 0.5in; }
                                }
                              </style>
                            </head>
                            <body>
                              <div class="w2-page">
                                <div class="header-row">
                                  <div class="void-section">
                                    <div class="void-box"></div>
                                    <div class="void-label">VOID</div>
                                  </div>
                                  <div class="ssn-section">
                                    <span class="ssn-label">a</span>
                                    <span class="ssn-label">Employee's social security number</span>
                                    <span class="ssn-value">${officer?.ssn ? officer.ssn.slice(-4).padStart(11, '*') : '***-**-****'}</span>
                                  </div>
                                  <div class="omb-section">
                                    <div class="omb-label">For Official Use Only</div>
                                    <div class="omb-value">OMB No. 1545-0029</div>
                                  </div>
                                </div>

                                <div class="w2-grid">
                                  <div class="box span-3">
                                    <div class="box-label"><strong>b</strong> Employer identification number (EIN)</div>
                                    <div class="box-value">${config?.employer_ein || 'Not Set'}</div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>1</strong> Wages, tips, other compensation</div>
                                    <div class="box-value">${w2.wages_tips_compensation.toFixed(2)}</div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>2</strong> Federal income tax withheld</div>
                                    <div class="box-value">${w2.federal_income_tax.toFixed(2)}</div>
                                  </div>

                                  <div class="box span-3 tall">
                                    <div class="box-label"><strong>c</strong> Employer's name, address, and ZIP code</div>
                                    <div class="box-value small-value" style="line-height: 1.3;">
                                      ${config?.company_legal_name ? config.company_legal_name.toUpperCase() : 'NOT SET'}<br>
                                      ${config?.company_address ? config.company_address.toUpperCase() : 'NOT SET'}
                                    </div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>3</strong> Social security wages</div>
                                    <div class="box-value">${w2.social_security_wages.toFixed(2)}</div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>4</strong> Social security tax withheld</div>
                                    <div class="box-value">${w2.social_security_tax.toFixed(2)}</div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>5</strong> Medicare wages and tips</div>
                                    <div class="box-value">${w2.medicare_wages.toFixed(2)}</div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>6</strong> Medicare tax withheld</div>
                                    <div class="box-value">${w2.medicare_tax.toFixed(2)}</div>
                                  </div>

                                  <div class="box span-3">
                                    <div class="box-label"><strong>d</strong> Control number</div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>7</strong> Social security tips</div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>8</strong> Allocated tips</div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box span-3 tall">
                                    <div class="box-label"><strong>e</strong> Employee's first name and initial</div>
                                    <div class="box-value">${officer?.first_name || ''} ${officer?.middle_initial || ''}</div>
                                    <div class="box-label" style="margin-top: 10px;">Last name</div>
                                    <div class="box-value">${officer?.last_name || ''}</div>
                                    <div class="box-label" style="margin-top: 4px;">Suff.</div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>9</strong></div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>10</strong> Dependent care benefits</div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>11</strong> Nonqualified plans</div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>12a</strong> See instructions for box 12</div>
                                    <div class="box-12-grid">
                                      <div class="box-12-row">
                                        <div>
                                          <div class="code-label">Code</div>
                                          <div class="code-box">${totalQualifiedOT > 0 ? 'TT' : ''}</div>
                                        </div>
                                        <div class="box-value" style="font-size: 9px; margin-top: 12px;">${totalQualifiedOT > 0 ? totalQualifiedOT.toFixed(2) : ''}</div>
                                      </div>
                                    </div>
                                  </div>

                                  <div class="box span-3 tall">
                                    <div class="box-label"><strong>f</strong> Employee's address and ZIP code</div>
                                    <div class="box-value small-value" style="line-height: 1.3;">
                                      ${(officer?.address || '').toUpperCase()}<br>
                                      ${officer?.city ? officer.city.toUpperCase() : ''}, ${officer?.state || 'VA'} ${officer?.zip_code || ''}
                                    </div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>12b</strong></div>
                                    <div class="box-12-row">
                                      <div>
                                        <div class="code-label">Code</div>
                                        <div class="code-box"></div>
                                      </div>
                                      <div class="box-value" style="font-size: 9px;"></div>
                                    </div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>12c</strong></div>
                                    <div class="box-12-row">
                                      <div>
                                        <div class="code-label">Code</div>
                                        <div class="code-box"></div>
                                      </div>
                                      <div class="box-value" style="font-size: 9px;"></div>
                                    </div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>12d</strong></div>
                                    <div class="box-12-row">
                                      <div>
                                        <div class="code-label">Code</div>
                                        <div class="code-box"></div>
                                      </div>
                                      <div class="box-value" style="font-size: 9px;"></div>
                                    </div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>13</strong></div>
                                    <div class="box-13-content">
                                      <div class="checkbox-group">
                                        <div class="checkbox"></div>
                                        <span class="checkbox-label">Statutory<br>employee</span>
                                      </div>
                                      <div class="checkbox-group">
                                        <div class="checkbox"></div>
                                        <span class="checkbox-label">Retirement<br>plan</span>
                                      </div>
                                      <div class="checkbox-group">
                                        <div class="checkbox"></div>
                                        <span class="checkbox-label">Third-party<br>sick pay</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div class="box span-4">
                                    <div class="box-14-grid">
                                      <div>
                                        <div class="box-label"><strong>14a</strong> Other</div>
                                        <div class="box-value"></div>
                                      </div>
                                      <div>
                                        <div class="box-label"><strong>14b</strong> Treasury Tipped Occupation Code(s)</div>
                                        <div class="box-value"></div>
                                      </div>
                                    </div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>15</strong> State</div>
                                    <div class="box-value">${w2.state || 'VA'}</div>
                                    <div class="box-label" style="margin-top: 4px; font-size: 6px;">Employer's state ID</div>
                                    <div class="box-value small-value">${w2.state === 'VA' ? (config?.state_tax_id_va || '') : (config?.state_tax_id_md || '')}</div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>16</strong> State wages, tips, etc.</div>
                                    <div class="box-value">${w2.state_wages.toFixed(2)}</div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>17</strong> State income tax</div>
                                    <div class="box-value">${w2.state_income_tax.toFixed(2)}</div>
                                  </div>

                                  <div class="box">
                                    <div class="box-label"><strong>18</strong> Local wages, tips, etc.</div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box span-2">
                                    <div class="box-label"><strong>19</strong> Local income tax</div>
                                    <div class="box-value"></div>
                                  </div>

                                  <div class="box span-2" style="border-bottom: none;">
                                    <div class="box-label"><strong>20</strong> Locality name</div>
                                    <div class="box-value"></div>
                                  </div>
                                </div>

                                <div class="footer">
                                  <div class="footer-text">
                                    <span class="footer-title">Form W-2</span> Wage and Tax Statement <span class="footer-year">${w2.tax_year}</span>
                                    <div class="department">Department of the Treasury—Internal Revenue Service</div>
                                  </div>
                                </div>

                                <div style="text-align: center; margin-top: 8px; font-size: 9px; font-weight: bold;">
                                  Copy B—To Be Filed With Employee's FEDERAL Tax Return.<br>
                                  <span style="font-size: 8px; font-weight: normal;">This information is being furnished to the Internal Revenue Service.</span>
                                </div>
                              </div>

                              <div style="margin-top: 20px; padding: 12px; background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; max-width: 8in; margin-left: auto; margin-right: auto;">
                                <p style="font-size: 10px; margin-bottom: 8px;"><strong>Payroll Contact Information:</strong></p>
                                <p style="font-size: 9px; margin: 0;">Email: ${config?.payroll_email || 'Not Set'}</p>
                                <p style="font-size: 9px; margin: 0;">Phone: ${config?.company_phone || 'Not Set'}</p>
                                <p style="font-size: 9px; margin: 0;">Company: ${config?.company_legal_name || 'Not Set'}</p>
                              </div>
                                    <div class="w2-box-label">a Employee's social security number</div>
                                    <div class="w2-box-value">${officer?.ssn ? officer.ssn.slice(-4).padStart(11, '*') : '***-**-****'}</div>
                                  </div>
                                  
                                  <div class="w2-box box-b">
                                    <div class="w2-box-label">b Employer identification number (EIN)</div>
                                    <div class="w2-box-value">${w2.employer_ein || config?.employer_ein || 'Not Set'}</div>
                                  </div>
                                  
                                  <div class="w2-box box-c">
                                    <div class="w2-box-label">c Employer's name, address, and ZIP code</div>
                                    <div class="w2-box-value" style="line-height: 1.4;">
                                      ${config?.company_legal_name ? config.company_legal_name.toUpperCase() : 'NOT SET'}<br>
                                      ${config?.company_address ? config.company_address.toUpperCase() : 'NOT SET'}
                                    </div>
                                  </div>
                                  
                                  <div class="w2-box box-d">
                                    <div class="w2-box-label">d Control number</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-e">
                                    <div class="w2-box-label">e Employee's first name and initial</div>
                                    <div class="w2-box-value">${officer?.first_name || ''} ${officer?.middle_initial || ''}</div>
                                    <div class="w2-box-label" style="margin-top: 8px;">Last name</div>
                                    <div class="w2-box-value">${officer?.last_name || ''}</div>
                                  </div>
                                  
                                  <div class="w2-box box-f">
                                    <div class="w2-box-label">f Employee's address and ZIP code</div>
                                    <div class="w2-box-value" style="line-height: 1.4;">
                                      ${(officer?.address || '').toUpperCase()}<br>
                                      ${officer?.city ? officer.city.toUpperCase() : ''}, ${officer?.state || 'VA'} ${officer?.zip_code || ''}
                                    </div>
                                  </div>
                                  
                                  <div class="w2-box box-1">
                                    <div class="w2-box-label">1 Wages, tips, other compensation</div>
                                    <div class="w2-box-value">$${w2.wages_tips_compensation.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-2">
                                    <div class="w2-box-label">2 Federal income tax withheld</div>
                                    <div class="w2-box-value">$${w2.federal_income_tax.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-3">
                                    <div class="w2-box-label">3 Social security wages</div>
                                    <div class="w2-box-value">$${w2.social_security_wages.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-4">
                                    <div class="w2-box-label">4 Social security tax withheld</div>
                                    <div class="w2-box-value">$${w2.social_security_tax.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-5">
                                    <div class="w2-box-label">5 Medicare wages and tips</div>
                                    <div class="w2-box-value">$${w2.medicare_wages.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-6">
                                    <div class="w2-box-label">6 Medicare tax withheld</div>
                                    <div class="w2-box-value">$${w2.medicare_tax.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-7">
                                    <div class="w2-box-label">7 Social security tips</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-8">
                                    <div class="w2-box-label">8 Allocated tips</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-9">
                                    <div class="w2-box-label">9</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-10">
                                    <div class="w2-box-label">10 Dependent care benefits</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-11">
                                    <div class="w2-box-label">11 Nonqualified plans</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-12a">
                                    <div class="w2-box-label">12a</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-12b">
                                    <div class="w2-box-label">12b</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-13">
                                    <div class="w2-box-label">13 Statutory employee / Retirement plan / Third-party sick pay</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-14">
                                    <div class="w2-box-label">14 Other</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-15">
                                    <div class="w2-box-label">15 State / Employer's state ID number</div>
                                    <div class="w2-box-value">${w2.state || 'VA'} / ${config?.state_tax_id_va || ''}</div>
                                  </div>
                                  
                                  <div class="w2-box box-16">
                                    <div class="w2-box-label">16 State wages, tips, etc.</div>
                                    <div class="w2-box-value">$${w2.state_wages.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-17">
                                    <div class="w2-box-label">17 State income tax</div>
                                    <div class="w2-box-value">$${w2.state_income_tax.toFixed(2)}</div>
                                  </div>
                                  
                                  <div class="w2-box box-18">
                                    <div class="w2-box-label">18 Local wages, tips, etc.</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-19">
                                    <div class="w2-box-label">19 Local income tax</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                  
                                  <div class="w2-box box-20">
                                    <div class="w2-box-label">20 Locality name</div>
                                    <div class="w2-box-value"></div>
                                  </div>
                                </div>
                              </div>
                              

                              <script>window.print();</script>
                              </body>
                              </html>
                              `);
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}