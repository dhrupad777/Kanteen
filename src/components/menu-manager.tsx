"use client";

import { useState, useEffect } from "react";
import { useMenu } from "@/hooks/use-menu";
import { DailyMenu } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Utensils, Save, Loader2, ChefHat, ToggleLeft, ToggleRight, Trash2, Plus, Coffee, Info, Sparkles, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function MenuManager() {
    const { toast } = useToast();
    const { menu, options, updateMenu, loading: menuLoading } = useMenu();

    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState<DailyMenu>({
        date: new Date().toISOString().split('T')[0],
        breakfast: [],
        main: { sabji: "", bread: "", dal: "", rice: "", salad: "", sweet: "", papad: "", prices: {} },
        snacks: [],
        special: [],
        visibility: {
            breakfast: true,
            main: true,
            snacks: true,
            special: true,
            note: true
        },
        note: ""
    });

    // Sync formData with menu from context
    useEffect(() => {
        if (menu) {
            // Backward compatibility
            const snacks = Array.isArray(menu.snacks) ? menu.snacks : [
                menu.prepared?.snacks01,
                menu.prepared?.snacks02,
                // @ts-ignore - map old structure if present
                menu.snacks?.snack1,
                // @ts-ignore
                menu.snacks?.snack2,
                // @ts-ignore
                menu.snacks?.snack3
            ].filter(Boolean) as string[];

            const breakfast = Array.isArray(menu.breakfast) ? menu.breakfast : [];

            const visibility = menu.visibility || {
                breakfast: true,
                main: true,
                snacks: true,
                special: true,
                note: true
            };

            const main = {
                sabji: menu.main?.sabji ?? menu.prepared?.sabji ?? "",
                dal: menu.main?.dal ?? menu.prepared?.dal ?? "",
                bread: menu.main?.bread ?? menu.prepared?.bread ?? "",
                rice: menu.main?.rice ?? menu.prepared?.rice ?? "",
                salad: menu.main?.salad ?? "",
                sweet: menu.main?.sweet ?? "",
                papad: menu.main?.papad ?? "",
                prices: menu.main?.prices ?? {},
            };

            // Handle special as array
            const special = Array.isArray(menu.special) ? menu.special :
                (typeof menu.special === 'string' && menu.special ? [menu.special] :
                    (menu.prepared?.specials ? [menu.prepared?.specials] : []));

            setFormData({
                date: menu.date || new Date().toISOString().split('T')[0],
                breakfast,
                main,
                snacks,
                special,
                visibility,
                note: menu.note || ""
            });
        }
    }, [menu]);

    type MainTextField = 'sabji' | 'dal' | 'bread' | 'rice' | 'salad' | 'sweet' | 'papad';
    const handleMainChange = (field: MainTextField, value: string) => {
        setFormData(prev => ({ ...prev, main: { ...prev.main, [field]: value } }));
    };
    const handleMainPriceChange = (field: MainTextField, value: string) => {
        const price = value === '' ? undefined : Math.max(0, parseFloat(value) || 0);
        setFormData(prev => ({
            ...prev,
            main: {
                ...prev.main,
                prices: { ...(prev.main.prices ?? {}), [field]: price || undefined }
            }
        }));
    };

    const handleNoteChange = (value: string) => {
        setFormData(prev => ({ ...prev, note: value }));
    };

    const toggleVisibility = (section: keyof DailyMenu['visibility']) => {
        setFormData(prev => ({
            ...prev,
            visibility: { ...prev.visibility, [section]: !prev.visibility[section] }
        }));
    };

    // --- Dynamic Array Logic ---

    const updateBreakfast = (index: number, val: string) => {
        const copy = [...formData.breakfast];
        copy[index] = val;
        setFormData(prev => ({ ...prev, breakfast: copy }));
    };
    const addBreakfast = () => setFormData(prev => ({ ...prev, breakfast: [...prev.breakfast, ""] }));
    const removeBreakfast = (index: number) => {
        setFormData(prev => ({ ...prev, breakfast: prev.breakfast.filter((_, i) => i !== index) }));
    };

    const updateSnack = (index: number, val: string) => {
        const copy = [...formData.snacks];
        copy[index] = val;
        setFormData(prev => ({ ...prev, snacks: copy }));
    };
    const addSnack = () => setFormData(prev => ({ ...prev, snacks: [...prev.snacks, ""] }));
    const removeSnack = (index: number) => {
        setFormData(prev => ({ ...prev, snacks: prev.snacks.filter((_, i) => i !== index) }));
    };

    // New Special Handlers
    const updateSpecial = (index: number, val: string) => {
        const copy = [...formData.special];
        copy[index] = val;
        setFormData(prev => ({ ...prev, special: copy }));
    };
    const addSpecial = () => setFormData(prev => ({ ...prev, special: [...prev.special, ""] }));
    const removeSpecial = (index: number) => {
        setFormData(prev => ({ ...prev, special: prev.special.filter((_, i) => i !== index) }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Clean up empty strings
            const payload: DailyMenu = {
                ...formData,
                breakfast: formData.breakfast.filter(s => s && s.trim().length > 0),
                snacks: formData.snacks.filter(s => s && s.trim().length > 0),
                special: formData.special.filter(s => s && s.trim().length > 0)
            };

            await updateMenu(payload);

            toast({ title: "Menu Updated", description: "Live for students." });
        } catch (err) {
            console.error("Error saving menu", err);
            toast({ title: "Error", description: "Failed update.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    if (menuLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    // Helper for Section Header with Visibility Toggle
    const SectionHeader = ({ icon: Icon, label, sectionKey }: { icon: any, label: string, sectionKey: keyof DailyMenu['visibility'] }) => (
        <div className="flex items-center justify-between mb-2">
            <div className="font-semibold flex items-center gap-2 text-foreground/80">
                <Icon className="h-4 w-4" /> {label}
            </div>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleVisibility(sectionKey)}
                className={`h-6 px-2 text-xs ${formData.visibility[sectionKey] ? 'text-muted-foreground' : 'text-orange-600 bg-orange-50 hover:bg-orange-100'}`}
                title={formData.visibility[sectionKey] ? "Hide from students" : "Show to students"}
            >
                {formData.visibility[sectionKey] ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
                {formData.visibility[sectionKey] ? "Visible" : "Hidden"}
            </Button>
        </div>
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Utensils className="h-5 w-5 text-primary" />
                    <CardTitle>Daily Menu Manager</CardTitle>
                </div>
                <CardDescription>Update the canteen menu for today.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Breakfast */}
                <div className={`rounded-lg border p-4 transition-colors ${formData.visibility.breakfast ? 'bg-muted/20' : 'bg-orange-50/50 border-orange-100'}`}>
                    <SectionHeader icon={Coffee} label="Breakfast" sectionKey="breakfast" />
                    <div className="space-y-2">
                        {formData.breakfast.map((item, idx) => (
                            <div key={idx} className="flex gap-2">
                                <Input
                                    value={item}
                                    onChange={(e) => updateBreakfast(idx, e.target.value)}
                                    placeholder="Enter breakfast item (e.g. Poha)"
                                    className="flex-1"
                                />
                                <Button variant="ghost" size="icon" onClick={() => removeBreakfast(idx)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addBreakfast} className="w-full border-dashed text-muted-foreground">
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Breakfast Item
                        </Button>
                    </div>
                </div>

                {/* Main Course Section */}
                <div className={`rounded-lg border p-4 transition-colors ${formData.visibility.main ? 'bg-muted/20' : 'bg-orange-50/50 border-orange-100'}`}>
                    <SectionHeader icon={ChefHat} label="Main Course" sectionKey="main" />
                    <p className="text-[10px] text-muted-foreground mb-3">Set a price (₹) to make an item available for online parcel orders.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {([
                            { field: 'sabji', label: 'Sabji' },
                            { field: 'dal', label: 'Dal' },
                            { field: 'bread', label: 'Bread' },
                            { field: 'rice', label: 'Rice' },
                            { field: 'salad', label: 'Salad' },
                            { field: 'sweet', label: 'Sweet' },
                            { field: 'papad', label: 'Papad' },
                        ] as const).map(({ field, label }) => (
                            <div key={field} className="space-y-1">
                                <Label className="text-xs">{label}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={(formData.main as any)[field] ?? ""}
                                        onChange={(e) => handleMainChange(field, e.target.value)}
                                        placeholder={`Enter ${label}`}
                                        className="flex-1"
                                    />
                                    <div className="relative flex items-center w-20 shrink-0">
                                        <span className="absolute left-2.5 text-xs text-muted-foreground pointer-events-none">₹</span>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={(formData.main.prices as any)?.[field] ?? ""}
                                            onChange={(e) => handleMainPriceChange(field, e.target.value)}
                                            placeholder="—"
                                            className="pl-6 text-center w-full"
                                            title="Set price to make orderable online (parcel)"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Snacks Section */}
                <div className={`rounded-lg border p-4 transition-colors ${formData.visibility.snacks ? 'bg-muted/20' : 'bg-orange-50/50 border-orange-100'}`}>
                    <SectionHeader icon={Utensils} label="Snacks" sectionKey="snacks" />
                    <div className="space-y-2">
                        {formData.snacks.map((item, idx) => (
                            <div key={idx} className="flex gap-2">
                                <Input
                                    value={item}
                                    onChange={(e) => updateSnack(idx, e.target.value)}
                                    placeholder="Enter Snack Item"
                                    className="flex-1"
                                />
                                <Button variant="ghost" size="icon" onClick={() => removeSnack(idx)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={addSnack} className="w-full border-dashed text-muted-foreground">
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Snack Item
                        </Button>
                    </div>
                </div>

                {/* Special & Notes */}
                <div className={`rounded-lg border p-4 transition-colors ${formData.visibility.special || formData.visibility.note ? 'bg-muted/20' : 'bg-orange-50/50 border-orange-100'}`}>
                    <div className="space-y-6">
                        {/* Special */}
                        <div>
                            <SectionHeader icon={Sparkles} label="Special Items" sectionKey="special" />
                            <div className="space-y-2">
                                {formData.special.map((item, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <Input
                                            value={item}
                                            onChange={(e) => updateSpecial(idx, e.target.value)}
                                            placeholder="Enter Special Item"
                                            className="flex-1"
                                        />
                                        <Button variant="ghost" size="icon" onClick={() => removeSpecial(idx)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addSpecial} className="w-full border-dashed text-muted-foreground">
                                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Special Item
                                </Button>
                            </div>
                        </div>

                        {/* Note */}
                        <div>
                            <SectionHeader icon={Info} label="Additional Note" sectionKey="note" />
                            <Input
                                value={formData.note}
                                onChange={(e) => handleNoteChange(e.target.value)}
                                placeholder="e.g. No Paratha today"
                            />
                        </div>
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
