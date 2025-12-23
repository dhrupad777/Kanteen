"use client";

import { useState, useEffect } from "react";
import { useMenu } from "@/hooks/use-menu";
import { DailyMenu } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Utensils, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function MenuManager() {
    const { toast } = useToast();
    const { menu, options, updateMenu, loading: menuLoading } = useMenu();

    const [saving, setSaving] = useState(false);
    // Local state for the form, initialized from context
    const [formData, setFormData] = useState<Partial<DailyMenu>>({
        prepared: {
            sabji: "", bread: "", dal: "", rice: "", snacks01: "", snacks02: "", specials: ""
        },
        note: ""
    });

    // Sync formData with menu from context when it loads
    useEffect(() => {
        if (menu) {
            setFormData({
                prepared: { ...menu.prepared },
                note: menu.note || ""
            });
        }
    }, [menu]);

    const handlePreparedChange = (field: keyof DailyMenu['prepared'], value: string) => {
        setFormData(prev => ({
            ...prev,
            prepared: {
                ...prev.prepared!,
                [field]: value
            }
        }));
    };

    const handleNoteChange = (value: string) => {
        setFormData(prev => ({ ...prev, note: value }));
    };

    const handleSave = async () => {
        if (!formData.prepared) return;

        setSaving(true);
        try {
            await updateMenu({
                prepared: formData.prepared,
                note: formData.note || ""
            } as DailyMenu); // Cast if needed, or ensure type match

            toast({
                title: "Menu Updated",
                description: "Today's menu is now live for students.",
            });
        } catch (err) {
            console.error("Error saving menu", err);
            toast({
                title: "Error",
                description: "Failed to update menu. Check your permissions.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (menuLoading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Utensils className="h-5 w-5 text-primary" />
                    <CardTitle>Daily Menu Manager</CardTitle>
                </div>
                <CardDescription>Update the canteen menu for today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Sabji */}
                    <div className="space-y-2">
                        <Label>Sabji</Label>
                        <Select
                            value={formData.prepared?.sabji}
                            onValueChange={(v) => handlePreparedChange("sabji", v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select Sabji" /></SelectTrigger>
                            <SelectContent>
                                {options.sabji?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Bread */}
                    <div className="space-y-2">
                        <Label>Bread</Label>
                        <Select
                            value={formData.prepared?.bread}
                            onValueChange={(v) => handlePreparedChange("bread", v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select Bread" /></SelectTrigger>
                            <SelectContent>
                                {options.bread?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Dal */}
                    <div className="space-y-2">
                        <Label>Dal</Label>
                        <Select
                            value={formData.prepared?.dal}
                            onValueChange={(v) => handlePreparedChange("dal", v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select Dal" /></SelectTrigger>
                            <SelectContent>
                                {options.dal?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Rice */}
                    <div className="space-y-2">
                        <Label>Rice</Label>
                        <Select
                            value={formData.prepared?.rice}
                            onValueChange={(v) => handlePreparedChange("rice", v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select Rice" /></SelectTrigger>
                            <SelectContent>
                                {options.rice?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Snack 1 */}
                    <div className="space-y-2">
                        <Label>Snack 1</Label>
                        <Select
                            value={formData.prepared?.snacks01}
                            onValueChange={(v) => handlePreparedChange("snacks01", v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select Snack 1" /></SelectTrigger>
                            <SelectContent>
                                {options.snacks01?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Snack 2 */}
                    <div className="space-y-2">
                        <Label>Snack 2</Label>
                        <Select
                            value={formData.prepared?.snacks02}
                            onValueChange={(v) => handlePreparedChange("snacks02", v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select Snack 2" /></SelectTrigger>
                            <SelectContent>
                                {options.snacks02?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Special */}
                    <div className="space-y-2 md:col-span-2">
                        <Label>Special</Label>
                        <Select
                            value={formData.prepared?.specials}
                            onValueChange={(v) => handlePreparedChange("specials", v)}
                        >
                            <SelectTrigger><SelectValue placeholder="Select Special" /></SelectTrigger>
                            <SelectContent>
                                {options.specials?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Note */}
                    <div className="space-y-2 md:col-span-2">
                        <Label>Additional Note</Label>
                        <Input
                            value={formData.note}
                            onChange={(e) => handleNoteChange(e.target.value)}
                            placeholder="e.g. No Paratha today"
                        />
                    </div>
                </div>

                <Button onClick={handleSave} className="w-full" disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Update Menu
                </Button>
            </CardContent>
        </Card>
    );
}
