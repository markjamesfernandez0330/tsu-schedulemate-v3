import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx-js-style";
import { Loader } from "@/components/loader";

export const Route = createFileRoute("/admin/reports")({
  component: Reports,
});

function Reports() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "bookings"), orderBy("createdAt", "desc")));
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = rows.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));

  const fmtTs = (t: any) => {
    const d = t?.toDate?.() ?? (t ? new Date(t) : null);
    return d ? format(d, "yyyy-MM-dd HH:mm") : "";
  };

  const previewPDF = () => {
    const stamp = format(new Date(), "yyyy-MM-dd HH:mm");
    const headers = ["Full Name","Student Number","Email","ID Reason","Data Privacy Agreed","Schedule Date","Schedule Time","Status","Processed By","Created At","Updated At"];
    const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const rowsHtml = filtered.map((r) => `<tr>${[
      r.fullName || r.userName || "",
      r.studentNumber || "",
      r.userEmail || "",
      r.reason || "",
      r.privacyAgreed ? "Yes" : "No",
      r.date || "",
      r.period || "",
      r.status || "pending",
      r.processedBy || "",
      fmtTs(r.createdAt),
      fmtTs(r.updatedAt),
    ].map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>TSU IdSked - Student List ${stamp}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 16px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td, th { border: 1px solid #800000; padding: 6px 8px; word-wrap: break-word; vertical-align: top; }
  .banner { background: #5B0000; color: #fff; font-weight: bold; text-align: center; padding: 14px; white-space: pre-line; font-size: 13px; border: 1px solid #5B0000; }
  thead th { background: #FFD700; color: #800000; font-weight: bold; text-align: center; }
  tbody tr:nth-child(even) td { background: #FFF8E1; }
  .toolbar { margin-bottom: 12px; display: flex; gap: 8px; }
  .toolbar button { padding: 6px 12px; cursor: pointer; }
  @media print { .toolbar { display: none; } body { padding: 0; } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()">Close</button></div>
<table>
  <thead>
    <tr><td colspan="${headers.length}" class="banner">Tarlac State University - Office of Business Affairs and Auxiliary Services
Exported List of Students
TSU ID Scheduling System</td></tr>
    <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
  </thead>
  <tbody>${rowsHtml || `<tr><td colspan="${headers.length}" style="text-align:center;padding:24px;">No records.</td></tr>`}</tbody>
</table>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const exportXLSX = () => {
    const stamp = format(new Date(), "yyyyMMdd_HHmm");
    const fileName = `TSU_IdSked-StudentList_${stamp}.xlsx`;

    const headerRow = [
      "Full Name","Student Number","Email","ID Reason","Data Privacy Agreed",
      "Schedule Date","Schedule Time","Status","Processed By","Created At","Updated At",
    ];
    const dataRows = filtered.map((r) => [
      r.fullName || r.userName || "",
      r.studentNumber || "",
      r.userEmail || "",
      r.reason || "",
      r.privacyAgreed ? "Yes" : "No",
      r.date || "",
      r.period || "",
      r.status || "pending",
      r.processedBy || "",
      fmtTs(r.createdAt),
      fmtTs(r.updatedAt),
    ]);

    // Match sample: banner in B1:end (col A empty on row 1), headers on row 2, data from row 3
    const lastCol = headerRow.length; // 11 columns starting at B (index 1) → last col index = 11
    const aoa: any[][] = [
      [
        "",
        "Tarlac State University - Office of Business Affairs and Auxiliary Services\nExported List of Students\nTSU ID Scheduling System",
      ],
      headerRow,
      ...dataRows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: lastCol } }];
    ws["!cols"] = [
      { wch: 28 }, { wch: 16 }, { wch: 36 }, { wch: 14 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 18 },
    ];
    ws["!rows"] = [{ hpt: 54 }];

    // Style banner (B1) — dark maroon fill, white bold text, centered/wrapped
    const banner = ws["B1"];
    if (banner) {
      banner.s = {
        font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "FF5B0000" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      };
    }
    // Style header row (A2:J2) — gold bg, maroon bold text
    const headerStyle = {
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FF800000" } },
      fill: { patternType: "solid", fgColor: { rgb: "FFFFD700" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "FF800000" } },
        bottom: { style: "thin", color: { rgb: "FF800000" } },
        left: { style: "thin", color: { rgb: "FF800000" } },
        right: { style: "thin", color: { rgb: "FF800000" } },
      },
    };
    for (let c = 0; c < headerRow.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: 1, c });
      if (ws[addr]) (ws[addr] as any).s = headerStyle;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Filter, print, or export booking records.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportXLSX}><FileSpreadsheet className="h-4 w-4 mr-2" />Export Excel</Button>
          <Button onClick={previewPDF}><FileText className="h-4 w-4 mr-2" />Preview PDF</Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader><CardTitle>Filter</CardTitle></CardHeader>
        <CardContent className="flex gap-3 flex-wrap items-end">
          <div><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="text-sm text-muted-foreground">{filtered.length} record(s)</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Processed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.studentNumber || "—"}</TableCell>
                  <TableCell>{r.fullName || r.userName || "—"}</TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.period}</TableCell>
                  <TableCell>{r.reason}</TableCell>
                  <TableCell className="uppercase text-xs">{r.status || "pending"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.processedBy || "—"}</TableCell>
                </TableRow>
              ))}
              {loading && (
                <TableRow><TableCell colSpan={7} className="py-2"><Loader label="Fetching records…" /></TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No records.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}