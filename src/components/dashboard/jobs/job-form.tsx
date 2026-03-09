"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Lock, History, ChevronsUpDown, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { SchedulePicker } from "./schedule-picker";
import { AdapterIcon } from "@/components/adapter/adapter-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"

const retentionSchema = z.object({
    mode: z.enum(["NONE", "SIMPLE", "SMART"]),
    simple: z.object({
        keepCount: z.coerce.number().min(1).default(10)
    }).optional(),
    smart: z.object({
        daily: z.coerce.number().min(0).default(7),
        weekly: z.coerce.number().min(0).default(4),
        monthly: z.coerce.number().min(0).default(12),
        yearly: z.coerce.number().min(0).default(2),
    }).optional()
});

const destinationSchema = z.object({
    configId: z.string().min(1, "Destination is required"),
    retention: retentionSchema,
});

export interface JobData {
    id: string;
    name: string;
    schedule: string;
    enabled: boolean;
    sourceId: string;
    encryptionProfileId?: string;
    compression: string;
    notificationEvents?: string;
    notifications: { id: string, name: string }[];
    destinations: {
        configId: string;
        priority: number;
        retention: string;
    }[];
}

export interface AdapterOption {
    id: string;
    name: string;
    adapterId: string;
}

export interface EncryptionOption {
    id: string;
    name: string;
}

const jobSchema = z.object({
    name: z.string().min(1, "Name is required"),
    schedule: z.string().min(1, "Cron schedule is required"),
    sourceId: z.string().min(1, "Source is required"),
    destinations: z.array(destinationSchema).min(1, "At least one destination is required"),
    encryptionProfileId: z.string().optional(),
    compression: z.enum(["NONE", "GZIP", "BROTLI"]).default("NONE"),
    notificationIds: z.array(z.string()).optional(),
    notificationEvents: z.enum(["ALWAYS", "FAILURE_ONLY", "SUCCESS_ONLY"]).default("ALWAYS"),
    enabled: z.boolean().default(true),
});

const defaultRetentionValue = { mode: "NONE" as const, simple: { keepCount: 10 }, smart: { daily: 7, weekly: 4, monthly: 12, yearly: 2 } };

interface JobFormProps {
    sources: AdapterOption[];
    destinations: AdapterOption[];
    notifications: AdapterOption[];
    encryptionProfiles: EncryptionOption[];
    initialData: {
        id: string;
        name: string;
        schedule: string;
        enabled: boolean;
        sourceId: string;
        encryptionProfileId?: string;
        compression: string;
        notificationEvents?: string;
        notifications: { id: string; name: string }[];
        destinations: { configId: string; priority: number; retention: string }[];
    } | null;
    onSuccess: () => void;
}

function parseRetention(retentionStr: string) {
    try {
        const parsed = JSON.parse(retentionStr);
        if (!parsed.simple) parsed.simple = { keepCount: 10 };
        if (!parsed.smart) parsed.smart = { daily: 7, weekly: 4, monthly: 12, yearly: 2 };
        if (!parsed.mode) parsed.mode = "NONE";
        return parsed;
    } catch {
        return { ...defaultRetentionValue };
    }
}

export function JobForm({ sources, destinations, notifications, encryptionProfiles, initialData, onSuccess }: JobFormProps) {
    const [sourceOpen, setSourceOpen] = useState(false);
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [expandedDests, setExpandedDests] = useState<Set<number>>(new Set());

    const defaultDestinations = initialData?.destinations?.length
        ? initialData.destinations.map(d => ({
            configId: d.configId,
            retention: parseRetention(d.retention),
        }))
        : [{ configId: "", retention: { ...defaultRetentionValue } }];

    const form = useForm({
        resolver: zodResolver(jobSchema),
        defaultValues: {
            name: initialData?.name || "",
            schedule: initialData?.schedule || "0 0 * * *",
            sourceId: initialData?.sourceId || "",
            destinations: defaultDestinations,
            encryptionProfileId: initialData?.encryptionProfileId || "no-encryption",
            compression: (initialData?.compression as "NONE" | "GZIP" | "BROTLI") || "NONE",
            notificationIds: initialData?.notifications?.map((n) => n.id) || [],
            notificationEvents: (initialData?.notificationEvents as "ALWAYS" | "FAILURE_ONLY" | "SUCCESS_ONLY") || "ALWAYS",
            enabled: initialData?.enabled ?? true,
        }
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "destinations",
    });

    const toggleExpanded = (index: number) => {
        setExpandedDests(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const onSubmit = async (data: z.infer<typeof jobSchema>) => {
         try {
            const url = initialData ? `/api/jobs/${initialData.id}` : '/api/jobs';
            const method = initialData ? 'PUT' : 'POST';

            const payload = {
                ...data,
                encryptionProfileId: data.encryptionProfileId === "no-encryption" ? "" : data.encryptionProfileId,
                destinations: data.destinations.map((d, i) => ({
                    configId: d.configId,
                    priority: i,
                    retention: d.retention,
                }))
            };

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success(initialData ? "Job updated" : "Job created");
                onSuccess();
            } else {
                 const result = await res.json();
                 toast.error(result.error || "Operation failed");
            }
        } catch { toast.error("Error occurred"); }
    };

    // Get used destination IDs to prevent duplicates
    const usedDestIds = form.watch("destinations").map(d => d.configId).filter(Boolean);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* Header: Name */}
                <div className="flex flex-col md:flex-row gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem className="flex-1">
                            <FormLabel>Job Name</FormLabel>
                            <FormControl><Input placeholder="Daily Production Backup" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )} />
                </div>

                <Tabs defaultValue="config" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="config">General</TabsTrigger>
                        <TabsTrigger value="destinations">Destinations</TabsTrigger>
                        <TabsTrigger value="security">Security</TabsTrigger>
                        <TabsTrigger value="notifications">Notify</TabsTrigger>
                    </TabsList>

                    {/* TAB 1: GENERAL (Source, Active Status, Schedule) */}
                    <TabsContent value="config" className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="sourceId" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Source</FormLabel>
                                    <Popover open={sourceOpen} onOpenChange={setSourceOpen} modal={true}>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={sourceOpen}
                                                    className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
                                                >
                                                    {field.value ? (
                                                        <span className="flex items-center gap-2">
                                                            <AdapterIcon adapterId={sources.find((s) => s.id === field.value)?.adapterId ?? ""} className="h-4 w-4" />
                                                            {sources.find((s) => s.id === field.value)?.name}
                                                        </span>
                                                    ) : "Select Source"}
                                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                            <Command>
                                                <CommandInput placeholder="Search source..." />
                                                <CommandList>
                                                    <CommandEmpty>No source found.</CommandEmpty>
                                                    <CommandGroup>
                                                        {sources.map((s) => (
                                                            <CommandItem
                                                                value={s.name}
                                                                key={s.id}
                                                                onSelect={() => {
                                                                    form.setValue("sourceId", s.id);
                                                                    setSourceOpen(false);
                                                                }}
                                                                className={cn(field.value === s.id && "bg-accent")}
                                                            >
                                                                <AdapterIcon adapterId={s.adapterId} className="h-4 w-4" />
                                                                {s.name}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={form.control} name="enabled" render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Active Status</FormLabel>
                                    <div className="flex h-10 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2">
                                        <span className="text-sm text-muted-foreground">
                                            {field.value ? "Enabled" : "Disabled"}
                                        </span>
                                        <FormControl>
                                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                                        </FormControl>
                                    </div>
                                    <FormDescription>Enable automatic execution</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <FormField control={form.control} name="schedule" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Schedule</FormLabel>
                                <FormControl>
                                    <SchedulePicker value={field.value} onChange={field.onChange} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                    </TabsContent>

                    {/* TAB 2: DESTINATIONS */}
                    <TabsContent value="destinations" className="space-y-4 pt-4">
                        <Card className="border-border">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">Destinations</CardTitle>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            append({ configId: "", retention: { ...defaultRetentionValue } });
                                        }}
                                        disabled={usedDestIds.length >= destinations.length}
                                    >
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add Destination
                                    </Button>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Backups are uploaded sequentially to each destination. Configure retention per destination.
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {fields.length === 0 && (
                                    <div className="bg-muted p-4 rounded-md text-sm text-muted-foreground text-center">
                                        No destinations configured. Add at least one destination.
                                    </div>
                                )}
                                {fields.length > 0 && (
                                    <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[400px]">
                                        <div className="space-y-3 pr-3">
                                            {fields.map((field, index) => (
                                                <DestinationRow
                                                    key={field.id}
                                                    index={index}
                                                    form={form}
                                                    destinations={destinations}
                                                    usedDestIds={usedDestIds}
                                                    isExpanded={expandedDests.has(index)}
                                                    onToggleExpand={() => toggleExpanded(index)}
                                                    onRemove={() => {
                                                        remove(index);
                                                        setExpandedDests(prev => {
                                                            const next = new Set<number>();
                                                            prev.forEach(i => {
                                                                if (i < index) next.add(i);
                                                                else if (i > index) next.add(i - 1);
                                                            });
                                                            return next;
                                                        });
                                                    }}
                                                    canRemove={fields.length > 1}
                                                />
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                                {form.formState.errors.destinations?.root && (
                                    <p className="text-sm text-destructive">{form.formState.errors.destinations.root.message}</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* TAB 3: SECURITY & OPTIMIZATION */}
                    <TabsContent value="security" className="space-y-4 pt-4">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="encryptionProfileId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex items-center gap-2">
                                        <Lock className="h-3 w-3" />
                                        Encryption
                                    </FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value || "no-encryption"}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="No Encryption" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="no-encryption">None (Unencrypted)</SelectItem>
                                            {encryptionProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Requires key to restore.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={form.control} name="compression" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Compression</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select compression" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="NONE">None (Fastest)</SelectItem>
                                            <SelectItem value="GZIP">Gzip (Standard)</SelectItem>
                                            <SelectItem value="BROTLI">Brotli (Best Compression)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>Trade CPU for storage.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                    </TabsContent>

                    {/* TAB 4: NOTIFICATIONS */}
                    <TabsContent value="notifications" className="pt-4 space-y-4">
                        <FormField control={form.control} name="notificationEvents" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notification Trigger</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select trigger" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="ALWAYS">Always (Success & Failure)</SelectItem>
                                        <SelectItem value="FAILURE_ONLY">On Failure Only</SelectItem>
                                        <SelectItem value="SUCCESS_ONLY">On Success Only</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormDescription>Choose when to send alerts.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="notificationIds" render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Active Notification Channels</FormLabel>
                                <Popover open={notifyOpen} onOpenChange={setNotifyOpen} modal={true}>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={notifyOpen}
                                                className="w-full justify-between"
                                            >
                                                Add Notification Channel
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search notifications..." />
                                            <CommandList>
                                                <CommandEmpty>No channel found.</CommandEmpty>
                                                <CommandGroup>
                                                    {notifications.map((n) => (
                                                        <CommandItem
                                                            value={n.name}
                                                            key={n.id}
                                                            onSelect={() => {
                                                                const current = field.value || [];
                                                                if (!current.includes(n.id)) {
                                                                    field.onChange([...current, n.id]);
                                                                } else {
                                                                    field.onChange(current.filter(id => id !== n.id));
                                                                }
                                                                setNotifyOpen(false);
                                                            }}
                                                            className={cn((field.value || []).includes(n.id) && "bg-accent")}
                                                        >
                                                            <AdapterIcon adapterId={n.adapterId} className="h-4 w-4" />
                                                            {n.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <div className="min-h-25 border rounded-md mt-2 p-2">
                                    {field.value && field.value.length > 0 ? (
                                        <div className="flex gap-2 flex-wrap">
                                            {field.value.map((id: string) => {
                                                const n = notifications.find((x) => x.id === id);
                                                return (
                                                    <div key={id} className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center shadow-sm">
                                                        {n?.name}
                                                        <button type="button" onClick={() => field.onChange((field.value || []).filter((x: string) => x !== id))} className="ml-2 hover:text-destructive font-bold">×</button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground p-2 italic">No notifications configured.</p>
                                    )}
                                </div>
                                <FormDescription>
                                    Selected channels will receive alerts on backup success/failure.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )} />
                    </TabsContent>
                </Tabs>

                <div className="pt-4 border-t">
                    <Button type="submit" className="w-full">Save Job Configuration</Button>
                </div>
            </form>
        </Form>
    )
}

// --- Destination Row Component ---

interface DestinationRowProps {
    index: number;
    form: any;
    destinations: AdapterOption[];
    usedDestIds: string[];
    isExpanded: boolean;
    onToggleExpand: () => void;
    onRemove: () => void;
    canRemove: boolean;
}

function DestinationRow({ index, form, destinations, usedDestIds, isExpanded, onToggleExpand, onRemove, canRemove }: DestinationRowProps) {
    const [destOpen, setDestOpen] = useState(false);
    const currentConfigId = form.watch(`destinations.${index}.configId`);
    const currentDest = destinations.find(d => d.id === currentConfigId);

    // Available destinations: not yet used by other rows OR is the current row's selection
    const availableDests = destinations.filter(d => !usedDestIds.includes(d.id) || d.id === currentConfigId);

    return (
        <div className="border rounded-lg">
            <div className="flex items-center gap-2 p-3">
                <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">#{index + 1}</span>

                <FormField control={form.control} name={`destinations.${index}.configId`} render={({ field }) => (
                    <FormItem className="flex-1 space-y-0">
                        <Popover open={destOpen} onOpenChange={setDestOpen} modal={true}>
                            <PopoverTrigger asChild>
                                <FormControl>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={destOpen}
                                        className={cn("w-full justify-between h-9", !field.value && "text-muted-foreground")}
                                    >
                                        {currentDest ? (
                                            <span className="flex items-center gap-2">
                                                <AdapterIcon adapterId={currentDest.adapterId} className="h-4 w-4" />
                                                {currentDest.name}
                                            </span>
                                        ) : "Select Destination"}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                    <CommandInput placeholder="Search destination..." />
                                    <CommandList>
                                        <CommandEmpty>No destination found.</CommandEmpty>
                                        <CommandGroup>
                                            {availableDests.map((d) => (
                                                <CommandItem
                                                    value={d.name}
                                                    key={d.id}
                                                    onSelect={() => {
                                                        form.setValue(`destinations.${index}.configId`, d.id);
                                                        setDestOpen(false);
                                                    }}
                                                    className={cn(field.value === d.id && "bg-accent")}
                                                >
                                                    <AdapterIcon adapterId={d.adapterId} className="h-4 w-4" />
                                                    {d.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                )} />

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2"
                    onClick={onToggleExpand}
                    title="Retention settings"
                >
                    <History className="h-4 w-4 mr-1" />
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>

                {canRemove && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 text-muted-foreground hover:text-destructive"
                        onClick={onRemove}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Inline Retention Config */}
            <Collapsible open={isExpanded}>
                <CollapsibleContent>
                    <div className="border-t px-3 py-3 bg-muted/30">
                        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <History className="h-3 w-3" />
                            Retention for {currentDest?.name || `Destination #${index + 1}`}
                        </div>
                        <RetentionConfig form={form} prefix={`destinations.${index}.retention`} />
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}

// --- Retention Config Component (reusable per destination) ---

function RetentionConfig({ form, prefix }: { form: any; prefix: string }) {
    const mode = form.watch(`${prefix}.mode`);

    return (
        <div className="space-y-3">
            <FormField
                control={form.control}
                name={`${prefix}.mode`}
                render={({ field }) => (
                    <Tabs value={field.value} onValueChange={field.onChange} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 h-8">
                            <TabsTrigger value="NONE" className="text-xs">Keep All</TabsTrigger>
                            <TabsTrigger value="SIMPLE" className="text-xs">Simple</TabsTrigger>
                            <TabsTrigger value="SMART" className="text-xs">Smart (GFS)</TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}
            />

            {mode === "NONE" && (
                <p className="text-xs text-muted-foreground">All backups kept indefinitely.</p>
            )}

            {mode === "SIMPLE" && (
                <FormField
                    control={form.control}
                    name={`${prefix}.simple.keepCount`}
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input type="number" min={1} {...field} value={field.value as number} onChange={e => field.onChange(parseInt(e.target.value))} className="w-20 h-8" />
                                </FormControl>
                                <span className="text-xs text-muted-foreground">newest backups</span>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}

            {mode === "SMART" && (
                <div className="grid grid-cols-4 gap-2">
                    {(["daily", "weekly", "monthly", "yearly"] as const).map(period => (
                        <FormField
                            key={period}
                            control={form.control}
                            name={`${prefix}.smart.${period}`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs capitalize">{period}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            min={0}
                                            {...field}
                                            value={field.value as number}
                                            onChange={e => field.onChange(parseInt(e.target.value))}
                                            className="h-8"
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
