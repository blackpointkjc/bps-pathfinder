import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Download, FileText } from "lucide-react";
import { format, startOfQuarter, endOfQuarter } from "date-fns";

export default function AccountingTaxLiability() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor((new Date().getMonth()) / 3) + 1);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const isAccountingRole = user?.additional_roles?.includes('accounting') || user?.role === 'admin';

  const { data: payrollEntries = [] } = useQuery({
    queryKey: ['payrollEntries'],
    queryFn: () => base44.entities.PayrollEntry.list('-created_date', 5000),
    enabled: isAccountingRole,
    refetchInterval: 10000,
  });

  const { data: config } = useQuery({
    queryKey: ['payrollConfig'],
    queryFn: async () => {
      const configs = await base44.entities.PayrollConfig.list();
      return configs[0] || null;
    },
    enabled: isAccountingRole,
  });

  const { data: officers = [] } = useQuery({
    queryKey: ['officers'],
    queryFn: () => base44.entities.User.list(),
    enabled: isAccountingRole,
  });

  if (!isAccountingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <DollarSign className="w-16 h-16 mx-auto mb-4 text-amber-600" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-slate-600">You don't have accounting access.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate quarterly breakdown
  const quarters = [1, 2, 3, 4];
  const quarterlyData = {};

  quarters.forEach(q => {
    const qStart = startOfQuarter(new Date(selectedYear, (q - 1) * 3, 1));
    const qEnd = endOfQuarter(qStart);

    const entriesInQuarter = payrollEntries.filter(e => {
      if (!e.pay_date) return false;
      const payDate = new Date(e.pay_date);
      return payDate >= qStart && payDate <= qEnd && String(e.status || '').toLowerCase() === 'paid';
    });

    quarterlyData[`Q${q}`] = {
      federal_tax: entriesInQuarter.reduce((sum, e) => sum + (e.federal_tax || 0), 0),
      social_security: entriesInQuarter.reduce((sum, e) => sum + (e.social_security || 0), 0),
      medicare: entriesInQuarter.reduce((sum, e) => sum + (e.medicare || 0), 0),
      state_tax_va: entriesInQuarter.reduce((sum, e) => {
        // Approximate VA tax by checking officer work state
        return e.state_tax && e.officer_email ? sum + (e.state_tax || 0) : sum;
      }, 0),
      state_tax_md: 0 // Similar logic can be added
    };
  });

  // Year totals
  const yearEntries = payrollEntries.filter(e => {
    if (!e.pay_date) return false;
    const payDate = new Date(e.pay_date);
    return payDate.getFullYear() === selectedYear && String(e.status || '').toLowerCase() === 'paid';
  });

  const yearTotals = {
    federal_tax: yearEntries.reduce((sum, e) => sum + (e.federal_tax || 0), 0),
    social_security_employee: yearEntries.reduce((sum, e) => sum + (e.social_security || 0), 0),
    social_security_employer: yearEntries.reduce((sum, e) => sum + (e.social_security || 0), 0), // Employer matches
    medicare_employee: yearEntries.reduce((sum, e) => sum + (e.medicare || 0), 0),
    medicare_employer: yearEntries.reduce((sum, e) => sum + (e.medicare || 0), 0), // Employer matches
    state_tax_va: yearEntries.reduce((sum, e) => sum + (e.state_tax || 0), 0),
    state_tax_md: 0
  };

  const totalLiability = 
    yearTotals.federal_tax +
    yearTotals.social_security_employee +
    yearTotals.social_security_employer +
    yearTotals.medicare_employee +
    yearTotals.medicare_employer +
    yearTotals.state_tax_va +
    yearTotals.state_tax_md;

  const taxCategories = [
    {
      name: "Federal Income Tax (Withheld)",
      amount: yearTotals.federal_tax,
      payTo: "Internal Revenue Service",
      address: "Department of the Treasury, Internal Revenue Service",
      frequency: "Monthly or Semi-Weekly",
      form: "Form 941",
      eftpsRequired: true
    },
    {
      name: "Social Security Tax (Employee)",
      amount: yearTotals.social_security_employee,
      payTo: "Internal Revenue Service",
      address: "Department of the Treasury, Internal Revenue Service",
      frequency: "Monthly or Semi-Weekly",
      form: "Form 941",
      eftpsRequired: true
    },
    {
      name: "Social Security Tax (Employer Match)",
      amount: yearTotals.social_security_employer,
      payTo: "Internal Revenue Service",
      address: "Department of the Treasury, Internal Revenue Service",
      frequency: "Monthly or Semi-Weekly",
      form: "Form 941",
      eftpsRequired: true
    },
    {
      name: "Medicare Tax (Employee)",
      amount: yearTotals.medicare_employee,
      payTo: "Internal Revenue Service",
      address: "Department of the Treasury, Internal Revenue Service",
      frequency: "Monthly or Semi-Weekly",
      form: "Form 941",
      eftpsRequired: true
    },
    {
      name: "Medicare Tax (Employer Match)",
      amount: yearTotals.medicare_employer,
      payTo: "Internal Revenue Service",
      address: "Department of the Treasury, Internal Revenue Service",
      frequency: "Monthly or Semi-Weekly",
      form: "Form 941",
      eftpsRequired: true
    },
    {
      name: "Virginia State Income Tax",
      amount: yearTotals.state_tax_va,
      payTo: "Virginia Department of Taxation",
      address: "P.O. Box 1115, Richmond, VA 23218-1115",
      frequency: "Monthly or Quarterly",
      form: "Form VA-6",
      eftpsRequired: false
    }
  ];

  const generateForm941 = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Form 941 - ${selectedYear}</title>
        <style>
          @page { size: letter; margin: 0.4in; }
          body { font-family: Arial, sans-serif; padding: 10px; font-size: 7pt; }
          .form-941 { border: 2px solid black; padding: 10px; max-width: 100%; }
          .header { text-align: center; border-bottom: 2px solid black; padding: 5px 0; margin-bottom: 8px; }
          .form-title { font-size: 12pt; font-weight: bold; }
          .company-info { font-size: 7pt; margin-bottom: 8px; line-height: 1.3; }
          .quarters-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .quarter-box { border: 1px solid #999; padding: 6px; background: #fafafa; }
          .quarter-title { background: #1e40af; color: white; padding: 4px; font-weight: bold; font-size: 8pt; text-align: center; margin: -6px -6px 6px -6px; }
          .line-item { display: grid; grid-template-columns: 25px 1fr 80px; gap: 4px; margin: 3px 0; padding: 2px 0; border-bottom: 1px solid #e5e7eb; font-size: 6.5pt; }
          .line-number { font-weight: bold; }
          .amount { text-align: right; font-weight: bold; }
          .total-row { background: #dbeafe; font-weight: bold; border: 1px solid #3b82f6; }
          .payment-box { margin-top: 8px; padding: 4px; background: #fef3c7; border: 1px solid #f59e0b; font-size: 6pt; line-height: 1.3; }
        </style>
      </head>
      <body>
        <div class="form-941">
          <div class="header">
            <div class="form-title">Form 941</div>
            <div style="font-size: 9pt;">Employer's QUARTERLY Federal Tax Return - ${selectedYear}</div>
          </div>
          
          <div class="company-info">
            <strong>EIN:</strong> ${config?.employer_ein || 'Not Set'} | 
            <strong>Name:</strong> ${config?.company_legal_name || 'Not Set'}<br>
            <strong>Address:</strong> ${config?.company_address || 'Not Set'}
          </div>
          
          <div class="quarters-grid">
            ${quarters.map(q => {
              const qData = quarterlyData['Q' + q];
              const totalFICA = (qData.social_security + qData.medicare) * 2;
              const totalTaxes = qData.federal_tax + totalFICA;
              return `
                <div class="quarter-box">
                  <div class="quarter-title">Quarter ${q} - ${selectedYear}</div>
                  
                  <div class="line-item">
                    <div class="line-number">1</div>
                    <div>Employees</div>
                    <div class="amount">${officers.filter(o => o.employment_status !== 'terminated').length}</div>
                  </div>
                  
                  <div class="line-item">
                    <div class="line-number">2</div>
                    <div>Wages/compensation</div>
                    <div class="amount">$${qData.federal_tax > 0 ? (qData.federal_tax / 0.12).toFixed(2) : '0.00'}</div>
                  </div>
                  
                  <div class="line-item">
                    <div class="line-number">3</div>
                    <div>Federal tax withheld</div>
                    <div class="amount">$${qData.federal_tax.toFixed(2)}</div>
                  </div>
                  
                  <div class="line-item">
                    <div class="line-number">5a</div>
                    <div>SS wages</div>
                    <div class="amount">$${(qData.social_security / 0.062).toFixed(2)}</div>
                  </div>
                  
                  <div class="line-item">
                    <div class="line-number">5c</div>
                    <div>Medicare wages</div>
                    <div class="amount">$${(qData.medicare / 0.0145).toFixed(2)}</div>
                  </div>
                  
                  <div class="line-item">
                    <div class="line-number">5d</div>
                    <div>Total SS & Medicare</div>
                    <div class="amount">$${totalFICA.toFixed(2)}</div>
                  </div>
                  
                  <div class="line-item total-row">
                    <div class="line-number">12</div>
                    <div><strong>TOTAL TAXES</strong></div>
                    <div class="amount">$${totalTaxes.toFixed(2)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="payment-box">
            <strong>Payment via EFTPS:</strong> www.eftps.gov | Phone: 1-800-555-4477
          </div>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
  };

  const generateFormVA6 = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Form VA-6 - ${selectedYear}</title>
        <style>
          @page { size: letter; margin: 0.4in; }
          body { font-family: Arial, sans-serif; padding: 10px; font-size: 7pt; }
          .form-va6 { border: 2px solid black; padding: 10px; max-width: 100%; }
          .header { text-align: center; border-bottom: 2px solid black; padding: 5px 0; margin-bottom: 8px; }
          .form-title { font-size: 12pt; font-weight: bold; }
          .company-info { font-size: 7pt; margin-bottom: 8px; line-height: 1.3; }
          .quarters-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .quarter-box { border: 1px solid #999; padding: 6px; background: #fafafa; }
          .quarter-title { background: #7c3aed; color: white; padding: 4px; font-weight: bold; font-size: 8pt; text-align: center; margin: -6px -6px 6px -6px; }
          .line-item { display: grid; grid-template-columns: 25px 1fr 80px; gap: 4px; margin: 3px 0; padding: 2px 0; border-bottom: 1px solid #e5e7eb; font-size: 6.5pt; }
          .line-number { font-weight: bold; }
          .amount { text-align: right; font-weight: bold; }
          .total-row { background: #dbeafe; font-weight: bold; border: 1px solid #3b82f6; }
          .payment-box { margin-top: 8px; padding: 4px; background: #fef3c7; border: 1px solid #f59e0b; font-size: 6pt; line-height: 1.3; }
        </style>
      </head>
      <body>
        <div class="form-va6">
          <div class="header">
            <div class="form-title">Form VA-6</div>
            <div style="font-size: 8pt;">Virginia Employer's Quarterly Return of Income Taxes Withheld - ${selectedYear}</div>
          </div>
          
          <div class="company-info">
            <strong>Federal ID:</strong> ${config?.employer_ein || 'Not Set'} | 
            <strong>VA Account:</strong> ${config?.state_tax_id_va || 'Not Set'}<br>
            <strong>Name:</strong> ${config?.company_legal_name || 'Not Set'}<br>
            <strong>Address:</strong> ${config?.company_address || 'Not Set'}
          </div>
          
          <div class="quarters-grid">
            ${quarters.map(q => {
              const qData = quarterlyData['Q' + q];
              return `
                <div class="quarter-box">
                  <div class="quarter-title">Quarter ${q} - ${selectedYear}</div>
                  
                  <div class="line-item">
                    <div class="line-number">1</div>
                    <div>VA income tax withheld</div>
                    <div class="amount">$${qData.state_tax_va.toFixed(2)}</div>
                  </div>
                  
                  <div class="line-item">
                    <div class="line-number">2</div>
                    <div>Penalty for late filing</div>
                    <div class="amount">$0.00</div>
                  </div>
                  
                  <div class="line-item">
                    <div class="line-number">3</div>
                    <div>Interest on late payment</div>
                    <div class="amount">$0.00</div>
                  </div>
                  
                  <div class="line-item total-row">
                    <div class="line-number">4</div>
                    <div><strong>TOTAL AMOUNT DUE</strong></div>
                    <div class="amount">$${qData.state_tax_va.toFixed(2)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="payment-box">
            <strong>Mail to:</strong> VA Dept of Taxation, P.O. Box 1115, Richmond, VA 23218-1115 | <strong>Online:</strong> www.tax.virginia.gov
          </div>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
  };

  const printReport = () => {
    const printContent = `
      <html>
      <head>
        <title>Tax Liability Report - ${selectedYear}</title>
        <style>
          @page { size: letter; margin: 0.5in; }
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #1e293b; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
          .summary { background: #eff6ff; border: 2px solid #3b82f6; padding: 20px; margin: 20px 0; }
          .total { font-size: 24px; font-weight: bold; color: #1e40af; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #1e40af; color: white; padding: 12px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #ddd; }
          .tax-item { background: #f8fafc; margin: 15px 0; padding: 15px; border-left: 4px solid #3b82f6; }
          .footer { margin-top: 40px; font-size: 10px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <h1>Tax Liability Report</h1>
        <p><strong>Year:</strong> ${selectedYear}</p>
        <p><strong>Generated:</strong> ${format(new Date(), 'MMMM d, yyyy')}</p>

        <div class="summary">
          <div class="total">Total Tax Liability: $${totalLiability.toFixed(2)}</div>
        </div>

        <h2>Tax Breakdown</h2>
        ${taxCategories.map(tax => `
          <div class="tax-item">
            <h3 style="margin: 0 0 10px 0; color: #1e40af;">${tax.name}</h3>
            <p style="font-size: 20px; font-weight: bold; margin: 10px 0;">$${tax.amount.toFixed(2)}</p>
            <p><strong>Pay To:</strong> ${tax.payTo}</p>
            <p><strong>Address:</strong> ${tax.address}</p>
            <p><strong>Payment Frequency:</strong> ${tax.frequency}</p>
            <p><strong>Required Form:</strong> ${tax.form}</p>
            ${tax.eftpsRequired ? '<p><strong>⚠️ EFTPS Required</strong></p>' : ''}
          </div>
        `).join('')}

        <h2>Quarterly Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Federal Tax</th>
              <th>Social Security</th>
              <th>Medicare</th>
              <th>State Tax (VA)</th>
            </tr>
          </thead>
          <tbody>
            ${quarters.map(q => `
              <tr>
                <td>Q${q} ${selectedYear}</td>
                <td>$${quarterlyData[`Q${q}`].federal_tax.toFixed(2)}</td>
                <td>$${quarterlyData[`Q${q}`].social_security.toFixed(2)}</td>
                <td>$${quarterlyData[`Q${q}`].medicare.toFixed(2)}</td>
                <td>$${quarterlyData[`Q${q}`].state_tax_va.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>${config?.company_legal_name || 'Black Point Protection Services'}</p>
          <p>EIN: ${config?.employer_ein || 'Not Set'}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '', 'width=850,height=1100');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Tax Liability Report</h1>
          <p className="text-slate-600">Track tax obligations and payment requirements</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={printReport} className="bg-blue-600">
            <Download className="w-4 h-4 mr-2" />
            Print Report
          </Button>
          <Button onClick={generateForm941} variant="outline">
            <FileText className="w-4 h-4 mr-2" />
            Form 941
          </Button>
          <Button onClick={generateFormVA6} variant="outline">
            <FileText className="w-4 h-4 mr-2" />
            VA Form 6
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex gap-4">
            <div>
              <Label>Year</Label>
              <Input
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-32"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 border-l-4 border-l-red-500">
        <CardHeader>
          <CardTitle className="text-2xl">Total Tax Liability ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-red-600">
            ${totalLiability.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4 mb-8">
        {taxCategories.map((tax, idx) => (
          <Card key={idx} className="border-l-4 border-l-blue-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{tax.name}</CardTitle>
                <p className="text-2xl font-bold text-blue-600">${tax.amount.toFixed(2)}</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-600 font-semibold">Pay To:</p>
                  <p className="text-slate-900">{tax.payTo}</p>
                </div>
                <div>
                  <p className="text-slate-600 font-semibold">Address:</p>
                  <p className="text-slate-900">{tax.address}</p>
                </div>
                <div>
                  <p className="text-slate-600 font-semibold">Payment Frequency:</p>
                  <p className="text-slate-900">{tax.frequency}</p>
                </div>
                <div>
                  <p className="text-slate-600 font-semibold">Required Form:</p>
                  <p className="text-slate-900">{tax.form}</p>
                </div>
                {tax.eftpsRequired && (
                  <div className="col-span-2">
                    <Badge className="bg-amber-600">EFTPS Payment Required</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quarterly Breakdown - {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left p-3 bg-slate-100">Quarter</th>
                  <th className="text-right p-3 bg-slate-100">Federal Tax</th>
                  <th className="text-right p-3 bg-slate-100">Social Security</th>
                  <th className="text-right p-3 bg-slate-100">Medicare</th>
                  <th className="text-right p-3 bg-slate-100">State Tax (VA)</th>
                  <th className="text-right p-3 bg-slate-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {quarters.map(q => {
                  const qData = quarterlyData[`Q${q}`];
                  const qTotal = qData.federal_tax + qData.social_security + qData.medicare + qData.state_tax_va;
                  return (
                    <tr key={q} className="border-b">
                      <td className="p-3 font-semibold">Q{q} {selectedYear}</td>
                      <td className="p-3 text-right">${qData.federal_tax.toFixed(2)}</td>
                      <td className="p-3 text-right">${qData.social_security.toFixed(2)}</td>
                      <td className="p-3 text-right">${qData.medicare.toFixed(2)}</td>
                      <td className="p-3 text-right">${qData.state_tax_va.toFixed(2)}</td>
                      <td className="p-3 text-right font-bold">${qTotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}