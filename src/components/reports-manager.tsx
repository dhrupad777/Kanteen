"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, FileText, Calendar, TrendingUp, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { checkManagerAllowlist } from "@/lib/auth";

interface DailyReport {
    date: string;
    totalOrders: number;
    totalRevenue: number;
    itemSummary: { [name: string]: number };
    generatedAt: any;
}

export function ReportsManager() {
    const [reports, setReports] = useState<DailyReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const { user } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        async function setupListener() {
            let isVerified = false;
            if (user?.email) {
                isVerified = await checkManagerAllowlist(user.email);
            }

            if (!isVerified) {
                setLoading(false);
                return;
            }

            const q = query(collection(db, "daily_reports"), orderBy("date", "desc"), limit(30));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const reportsData = snapshot.docs.map(doc => doc.data() as DailyReport);
                setReports(reportsData);
                setLoading(false);
            }, (error) => {
                if (error.code !== 'permission-denied') {
                    console.error("Reports listener error:", error);
                }
                setLoading(false);
            });

            return unsubscribe;
        }

        let unsub: (() => void) | undefined;
        setupListener().then(u => unsub = u);
        return () => unsub?.();
    }, [user]);

    async function generateReport() {
        setGenerating(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const token = await user?.getIdToken();
            const response = await fetch('/api/staff/reports/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ date: today })
            });

            if (!response.ok) throw new Error('Failed to generate report');

            toast({
                title: "Report Generated",
                description: "Today's statistics have been updated.",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to generate report",
                variant: "destructive",
            });
        } finally {
            setGenerating(false);
        }
    }

    function downloadCSV(report: DailyReport) {
        const headers = ["Item Name", "Quantity Sold"];
        const rows = Object.entries(report.itemSummary).map(([name, qty]) => [name, qty]);

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += `Daily Report for ${report.date}\n`;
        csvContent += `Total Orders, ${report.totalOrders}\n`;
        csvContent += `Total Revenue, ₹${report.totalRevenue}\n\n`;
        csvContent += headers.join(",") + "\n";
        rows.forEach(row => {
            csvContent += row.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Kanteen_Report_${report.date}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                        Daily Performance
                        <Badge variant="outline" className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 border-emerald-200 animate-pulse">
                            Live Updates
                        </Badge>
                    </h3>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Business Insights • Auto-Updated</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {reports.map((report) => (
                    <Card key={report.date} className="relative overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow group">
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => downloadCSV(report)}
                                className="h-10 w-10 p-0 rounded-full shadow-lg"
                            >
                                <Download className="h-4 w-4" />
                            </Button>
                        </div>

                        <CardHeader className="pb-4 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Report Date</p>
                                    <CardTitle className="text-2xl font-black tracking-tighter">
                                        {new Date(report.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </CardTitle>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Updated</p>
                                    <p className="text-xs font-bold">{report.generatedAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                                        <div className="p-1.5 bg-blue-50 rounded-lg">
                                            <Package className="h-4 w-4" />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Orders</span>
                                    </div>
                                    <p className="text-3xl font-black tracking-tighter">{report.totalOrders}</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <div className="flex items-center gap-2 text-emerald-600 mb-2">
                                        <div className="p-1.5 bg-emerald-50 rounded-lg">
                                            <TrendingUp className="h-4 w-4" />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest">Revenue</span>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-sm font-black">₹</span>
                                        <p className="text-3xl font-black tracking-tighter">{report.totalRevenue.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-3">
                                    Itemized Sales
                                    <span className="h-px flex-grow bg-slate-100 dark:bg-slate-800" />
                                </h4>
                                <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                                    {Object.entries(report.itemSummary).length > 0 ? (
                                        Object.entries(report.itemSummary).map(([name, qty]) => (
                                            <div key={name} className="flex justify-between items-center group/item">
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover/item:text-primary transition-colors">{name}</span>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-1 bg-slate-100 dark:bg-slate-800 w-12 rounded-full hidden sm:block">
                                                        <div
                                                            className="h-full bg-primary rounded-full"
                                                            style={{ width: `${Math.min((qty / report.totalOrders) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-black text-xs min-w-[2.5rem] text-center">
                                                        x{qty}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs italic text-muted-foreground text-center py-4">No individual items recorded</p>
                                    )}
                                </div>
                            </div>

                            <Button
                                onClick={() => downloadCSV(report)}
                                variant="secondary"
                                className="w-full sm:hidden font-black"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                DOWNLOAD CSV
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {reports.length === 0 && (
                <div className="flex flex-col items-center justify-center py-32 text-muted-foreground bg-white/40 dark:bg-slate-900/40 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800">
                    <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
                        <FileText className="h-12 w-12 opacity-10" />
                    </div>
                    <p className="font-black text-sm uppercase tracking-widest opacity-40 mb-4">No reports recorded yet</p>
                    <Button
                        variant="default"
                        onClick={generateReport}
                        className="font-black rounded-xl px-8"
                    >
                        START TODAY'S REPORT
                    </Button>
                </div>
            )}
        </div>
    );
}
