"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Timer, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { RetentionPolicy } from "@prisma/client";
import { getRetentionPolicies, createRetentionPolicy } from "@/app/actions/templates";
import { RetentionPolicyDialog } from "@/components/settings/templates/retention-policy-list";

interface Props {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowNone?: boolean;
}

export function RetentionPolicyPicker({
  value,
  onChange,
  placeholder = "Select retention policy...",
  allowNone = false,
}: Props) {
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    const res = await getRetentionPolicies();
    if (res.success && res.data) {
      setPolicies(res.data);
    } else {
      toast.error("Failed to load retention policies");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const selected = policies.find((p) => p.id === value);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={loading}
            className="w-full justify-between font-normal"
          >
            {loading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading...
              </span>
            ) : selected ? (
              <span className="flex items-center gap-2">
                <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                {selected.name}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search policies..." />
            <CommandList>
              <CommandEmpty>No policies found.</CommandEmpty>
              <CommandGroup>
                {allowNone && (
                  <CommandItem
                    value="__none__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        !value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="text-muted-foreground">None</span>
                  </CommandItem>
                )}
                {policies.map((policy) => (
                  <CommandItem
                    key={policy.id}
                    value={policy.name}
                    onSelect={() => {
                      onChange(policy.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === policy.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {policy.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  onSelect={() => {
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                  className="font-medium"
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create new policy...
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <RetentionPolicyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(policy) => {
          setPolicies((prev) => [
            ...prev.filter((p) => p.id !== policy.id),
            policy,
          ].sort((a, b) => a.name.localeCompare(b.name)));
          onChange(policy.id);
          setCreateOpen(false);
        }}
      />
    </>
  );
}
