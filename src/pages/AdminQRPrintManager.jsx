import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Printer, Search, CheckSquare, Square } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export default function AdminQRPrintManager() {
  const [search, setSearch] = useState("");
  const [filterSite, setFilterSite] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const queryClient = useQueryClient();
  const printRef = useRef(null);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: checkpoints } = useQuery({
    queryKey: ['qrCheckpoints'],
    queryFn: () => base44.entities.QRCheckpoint.list('checkpoint_name'),
  });

  const updatePrintMutation = useMutation({
    mutationFn: async (ids) => {
      const now = new Date().toISOString();
      await Promise.all(ids.map(id => {
        const cp = checkpoints?.find(c => c.id === id);
        return base44.entities.QRCheckpoint.update(id, {
          last_printed_at: now,
          first_printed_at: cp?.first_printed_at || now,
          print_count: (cp?.print_count || 0) + 1,
        });
      }));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qrCheckpoints'] }),
  });

  const allSites = [...new Set((checkpoints || []).map(c => c.property_site))];

  const filtered = (checkpoints || []).filter(cp => {
    const matchSearch = !search || cp.checkpoint_name.toLowerCase().includes(search.toLowerCase()) || cp.location_label.toLowerCase().includes(search.toLowerCase());
    const matchSite = filterSite === "all" || cp.property_site === filterSite;
    return matchSearch && matchSite;
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(c => c.id)));
  const clearAll = () => setSelected(new Set());

  const selectedCheckpoints = (checkpoints || []).filter(c => selected.has(c.id));

  const handlePrint = async () => {
    if (selected.size === 0) {
      toast.error("Please select at least one checkpoint.");
      return;
    }

    const ids = [...selected];
    const cps = (checkpoints || []).filter(c => ids.includes(c.id));

    // Build print HTML with 4x6 label grid (1.5" x 1.5" at 96dpi = 144px)
    const labelSize = 144; // px representing 1.5"
    const labelsPerRow = 4;
    const labelsPerPage = 24;

    const pages = [];
    for (let i = 0; i < cps.length; i += labelsPerPage) {
      pages.push(cps.slice(i, i + labelsPerPage));
    }

    const svgMap = {};
    cps.forEach(cp => {
      const div = document.createElement('div');
      div.style.display = 'none';
      document.body.appendChild(div);
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      div.appendChild(svgEl);
      document.body.removeChild(div);
    });

    const printWindow = window.open('', '', 'width=850,height=1100');
    const pageHTML = pages.map((page, pageIdx) => {
      const labels = page.map(cp => `
        <div class="label">
          <div class="qr-wrap">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(cp.qr_unique_id)}" width="110" height="110" />
          </div>
          <div class="name">${cp.checkpoint_name}</div>
          <div class="location">${cp.location_label}</div>
          <div class="qrid">${cp.qr_unique_id}</div>
        </div>
      `).join('');
      return `<div class="sheet">${labels}</div>`;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Labels</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.5in; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; }
          .sheet { display: grid; grid-template-columns: repeat(4, 1.5in); grid-template-rows: repeat(6, 1.5in); gap: 0.1in; page-break-after: always; }
          .label { width: 1.5in; height: 1.5in; border: 1px solid #ccc; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3px; text-align: center; overflow: hidden; }
          .qr-wrap { flex-shrink: 0; }
          .qr-wrap img { display: block; }
          .name { font-size: 6pt; font-weight: bold; line-height: 1.1; margin-top: 2px; max-width: 100%; word-wrap: break-word; }
          .location { font-size: 5pt; color: #555; line-height: 1.1; max-width: 100%; word-wrap: break-word; }
          .qrid { font-size: 4pt; color: #999; margin-top: 1px; font-family: monospace; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        <button class="no-print" onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;z-index:999;">🖨️ Print</button>
        ${pageHTML}
        <script>
          window.onload = () => setTimeout(() => window.print(), 800);
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();

    await updatePrintMutation.mutateAsync(ids);
    toast.success(`Printing ${cps.length} label${cps.length > 1 ? 's' : ''}`);
  };

  if (user?.role !== 'admin') {
    return <div className="p-8 text-center text-slate-500">Admin access required.</div>;
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl"><Printer className="w-6 h-6 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">QR Print Manager</h1>
            <p className="text-sm text-slate-500">1.5" × 1.5" labels • 4 across × 6 down • 24 per sheet</p>
          </div>
        </div>
        <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700" disabled={selected.size === 0}>
          <Printer className="w-4 h-4 mr-2" /> Print {selected.size > 0 ? `${selected.size} Label${selected.size > 1 ? 's' : ''}` : 'Labels'}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="All sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {allSites.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}><CheckSquare className="w-4 h-4 mr-1" /> All</Button>
          <Button variant="outline" size="sm" onClick={clearAll}><Square className="w-4 h-4 mr-1" /> None</Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          {selected.size} checkpoint{selected.size > 1 ? 's' : ''} selected → {Math.ceil(selected.size / 24)} sheet{Math.ceil(selected.size / 24) > 1 ? 's' : ''} needed
        </div>
      )}

      {/* Checkpoint list */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="w-10 p-3"></th>
                  <th className="text-left p-3 font-semibold text-slate-700">Checkpoint</th>
                  <th className="text-left p-3 font-semibold text-slate-700 hidden md:table-cell">Location</th>
                  <th className="text-left p-3 font-semibold text-slate-700 hidden lg:table-cell">Site</th>
                  <th className="text-center p-3 font-semibold text-slate-700">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-700 hidden md:table-cell">Prints</th>
                  <th className="text-center p-3 font-semibold text-slate-700">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(cp => (
                  <tr key={cp.id} className={`hover:bg-slate-50 ${selected.has(cp.id) ? 'bg-blue-50' : ''}`}>
                    <td className="p-3">
                      <Checkbox checked={selected.has(cp.id)} onCheckedChange={() => toggleSelect(cp.id)} />
                    </td>
                    <td className="p-3 font-medium text-slate-900">{cp.checkpoint_name}</td>
                    <td className="p-3 text-slate-600 hidden md:table-cell">{cp.location_label}</td>
                    <td className="p-3 text-slate-600 hidden lg:table-cell">{cp.property_site}</td>
                    <td className="p-3 text-center">
                      <Badge className={cp.is_active !== false ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'}>
                        {cp.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="p-3 text-center text-slate-500 hidden md:table-cell">
                      {cp.print_count || 0}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center">
                        <QRCodeSVG value={cp.qr_unique_id} size={40} />
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">No checkpoints found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Label preview */}
      {selectedCheckpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Label Preview ({selectedCheckpoints.length} labels)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 border border-slate-200 p-2 rounded bg-white" style={{ maxWidth: '600px' }}>
              {selectedCheckpoints.slice(0, 24).map(cp => (
                <div key={cp.id} className="border border-slate-300 flex flex-col items-center justify-center p-1 text-center" style={{ aspectRatio: '1', minHeight: '80px' }}>
                  <QRCodeSVG value={cp.qr_unique_id} size={50} />
                  <p className="text-[6px] font-bold leading-tight mt-1 break-words w-full">{cp.checkpoint_name}</p>
                  <p className="text-[5px] text-slate-500 leading-tight break-words w-full">{cp.location_label}</p>
                </div>
              ))}
            </div>
            {selectedCheckpoints.length > 24 && (
              <p className="text-xs text-slate-500 mt-2">+{selectedCheckpoints.length - 24} more on additional sheets</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}