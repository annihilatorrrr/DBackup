"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
    CredentialProfileDialog,
    type CredentialProfileSummary,
} from "@/components/settings/credential-profile-dialog";
import type { CredentialType } from "@/lib/core/credentials";

interface Props {
    slot: "primary" | "ssh";
    requiredType: CredentialType;
    value: string | null | undefined;
    onChange: (id: string | null) => void;
    /** Render label/help text inline. */
    label?: string;
    description?: string;
}

const TYPE_BADGE: Record<CredentialType, string> = {
    USERNAME_PASSWORD: "User/Pass",
    SSH_KEY: "SSH Key",
    ACCESS_KEY: "Access Key",
    TOKEN: "Token",
    SMTP: "SMTP",
};

export function CredentialPicker({
    slot,
    requiredType,
    value,
    onChange,
    label,
    description,
}: Props) {
    const [profiles, setProfiles] = useState<CredentialProfileSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);

    const fetchProfiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/credentials?type=${requiredType}`);
            const result = await res.json();
            if (!res.ok || !result.success) {
                toast.error(result.error || "Failed to load credential profiles");
                setProfiles([]);
                return;
            }
            setProfiles(result.data as CredentialProfileSummary[]);
        } finally {
            setLoading(false);
        }
    }, [requiredType]);

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    const handleSelect = (next: string) => {
        if (next === "__create__") {
            setCreateOpen(true);
            return;
        }
        onChange(next === "__none__" ? null : next);
    };

    const onCreated = (profile: CredentialProfileSummary) => {
        setProfiles((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
        onChange(profile.id);
    };

    const defaultLabel = slot === "ssh" ? "SSH Credential Profile" : "Credential Profile";
    const finalLabel = label ?? defaultLabel;

    return (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="h-4 w-4" />
                    {finalLabel}
                    <Badge variant="outline" className="font-normal">
                        {TYPE_BADGE[requiredType]}
                    </Badge>
                </Label>
            </div>
            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}

            <Select value={value ?? "__none__"} onValueChange={handleSelect} disabled={loading}>
                <SelectTrigger>
                    <SelectValue
                        placeholder={loading ? "Loading..." : "Select a profile"}
                    />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__none__">
                        <span className="text-muted-foreground">- None -</span>
                    </SelectItem>
                    {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                            {p.name}
                        </SelectItem>
                    ))}
                    <SelectItem value="__create__" className="font-medium">
                        <span className="flex items-center gap-2">
                            <Plus className="h-3.5 w-3.5" />
                            Create new profile...
                        </span>
                    </SelectItem>
                </SelectContent>
            </Select>

            {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading profiles...
                </div>
            )}

            {!loading && profiles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                    No matching profiles yet. Use{" "}
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => setCreateOpen(true)}
                    >
                        Create new profile
                    </Button>{" "}
                    to add one.
                </p>
            )}

            <CredentialProfileDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                forcedType={requiredType}
                onSaved={onCreated}
            />
        </div>
    );
}
