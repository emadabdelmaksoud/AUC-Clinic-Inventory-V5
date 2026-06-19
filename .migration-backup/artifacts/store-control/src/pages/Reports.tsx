import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStockSummary, listTransactionsFull, getOverviewKpis, type ReportFilters } from "@/lib/reports";
import { listWarehouses } from "@/lib/warehouses";
import { listProducts } from "@/lib/products";
import { TRANSACTION_TYPES, TRANSACTION_LABELS } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { exportInventoryExcel } from "@/lib/backup";
import { BarChart3, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import type { TransactionType } from "@/lib/db";

const txnColors: Record<string, string> = {
  stock_in: "bg-green-100 text-green-700",
  dispensing: "bg-blue-100 text-blue-700",
  transfer_in: "bg-purple-100 text-purple-700",
  transfer_out: "bg-orange-100 text-orange-700",
  disposal: "bg-red-100 text-red-700",
  adjustment: "bg-gray-100 text-gray-700",
  inventory_count: "bg-teal-100 text-teal-700",
};

export default function ReportsPage() {
  const [filters, setFilters] = useState<ReportFilters>({});
  const [tab, setTab] = useState("stock");

  const { data: warehouses = [] } = useQuery({ queryKey: ["warehouses"], queryFn: () => listWarehouses() });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const { data: stockSummary = [] } = useQuery({ queryKey: ["stock-summary"], queryFn: getStockSummary });
  const { data: txns = [], isLoading: txnsLoading } = useQuery({
    queryKey: ["txns-report", filters],
    queryFn: () => listTransactionsFull(filters),
  });

  const setFilter = (key: keyof ReportFilters, value: string | null) => {
    setFilters(prev => ({ ...prev, [key]: value === "all" ? null : value }));
  };

  const chartData = stockSummary.slice(0, 20).map(p => ({
    name: p.productName.length > 15 ? p.productName.slice(0, 15) + "…" : p.productName,
    stock: p.onHandBase,
    reorder: p.reorderLevel,
  }));

  const lowStock = stockSummary.filter(p => p.reorderLevel > 0 && p.onHandBase < p.reorderLevel);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6" /> Reports</h1>
          <p className="text-sm text-muted-foreground">Inventory analytics and transaction history</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportInventoryExcel().catch(e => toast.error(e.message))} data-testid="button-export-excel">
          <Download className="w-4 h-4 mr-1" /> Export Excel
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="stock">Stock Summary</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          {lowStock.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span><strong>{lowStock.length}</strong> product{lowStock.length !== 1 ? "s are" : " is"} below reorder level.</span>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Category</th>
                <th className="text-left px-4 py-3 font-medium">Stock</th>
                <th className="text-left px-4 py-3 font-medium">Reorder</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Batches</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr></thead>
              <tbody className="divide-y">
                {stockSummary.map(p => (
                  <tr key={p.productId} className="hover:bg-muted/30" data-testid={`stock-row-${p.productId}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.productName}</div>
                      <div className="text-xs font-mono text-muted-foreground">{p.productCode}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">{p.category ? <Badge variant="secondary" className="text-xs">{p.category}</Badge> : "—"}</td>
                    <td className="px-4 py-3 font-medium">{p.onHandBase.toLocaleString()} {p.baseUnit}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.reorderLevel}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{p.batchCount}</td>
                    <td className="px-4 py-3">
                      {p.expired > 0 && <Badge variant="destructive" className="text-xs mr-1">Expired: {p.expired}</Badge>}
                      {p.nearExpiry > 0 && <Badge className="text-xs bg-amber-500 mr-1">Near Expiry: {p.nearExpiry}</Badge>}
                      {p.reorderLevel > 0 && p.onHandBase < p.reorderLevel && <Badge className="text-xs bg-orange-500">Low Stock</Badge>}
                      {p.expired === 0 && p.nearExpiry === 0 && (p.reorderLevel === 0 || p.onHandBase >= p.reorderLevel) && <span className="text-green-600 text-xs">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-card border rounded-lg">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value || null)} data-testid="input-from" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value || null)} data-testid="input-to" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Warehouse</Label>
              <Select value={filters.warehouseId ?? "all"} onValueChange={(v) => setFilter("warehouseId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.warehouseName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={filters.transactionType ?? "all"} onValueChange={(v) => setFilter("transactionType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {TRANSACTION_TYPES.map(t => <SelectItem key={t} value={t}>{TRANSACTION_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {txnsLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
          ) : txns.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No transactions found</CardContent></Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Product</th>
                  <th className="text-left px-4 py-3 font-medium">Qty</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Warehouse</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Batch</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Expiry</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                </tr></thead>
                <tbody className="divide-y">
                  {txns.map(t => (
                    <tr key={t.id} className="hover:bg-muted/30" data-testid={`txn-report-${t.id}`}>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${txnColors[t.transactionType] ?? ""}`}>{TRANSACTION_LABELS[t.transactionType]}</span></td>
                      <td className="px-4 py-3"><div className="font-medium">{t.productName}</div><div className="text-xs text-muted-foreground">{t.productCode}</div></td>
                      <td className="px-4 py-3">{t.quantity} {t.unitName ?? ""}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{t.warehouseName}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{t.batchNumber ?? "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{t.expiryDate ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{format(new Date(t.createdAt), "MMM d, HH:mm")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="charts" className="space-y-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Stock Levels (Top 20 products)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="stock" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Stock" />
                  <Bar dataKey="reorder" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} name="Reorder Level" opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
