"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RetentionConfiguration, RetentionMode } from "@/lib/core/retention";

interface Props {
  value: RetentionConfiguration;
  onChange: (config: RetentionConfiguration) => void;
}

const DEFAULT_SIMPLE = { keepCount: 10 };
const DEFAULT_SMART = { daily: 7, weekly: 4, monthly: 12, yearly: 2 };

export function RetentionPolicyForm({ value, onChange }: Props) {
  const mode = value.mode;
  const simple = value.simple ?? DEFAULT_SIMPLE;
  const smart = value.smart ?? DEFAULT_SMART;

  function setMode(newMode: RetentionMode) {
    onChange({
      mode: newMode,
      simple: value.simple ?? DEFAULT_SIMPLE,
      smart: value.smart ?? DEFAULT_SMART,
    });
  }

  function setKeepCount(n: number) {
    onChange({ ...value, simple: { keepCount: n } });
  }

  function setSmartField(field: keyof typeof DEFAULT_SMART, n: number) {
    onChange({
      ...value,
      smart: { ...smart, [field]: n },
    });
  }

  return (
    <div className="space-y-3">
      <Label>Retention Mode</Label>
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as RetentionMode)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="NONE" className="text-xs">
            Keep All
          </TabsTrigger>
          <TabsTrigger value="SIMPLE" className="text-xs">
            Simple
          </TabsTrigger>
          <TabsTrigger value="SMART" className="text-xs">
            Smart (GFS)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "NONE" && (
        <p className="text-xs text-muted-foreground">
          All backups are kept indefinitely. No automatic deletion.
        </p>
      )}

      {mode === "SIMPLE" && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={simple.keepCount}
            onChange={(e) => setKeepCount(parseInt(e.target.value) || 1)}
            className="w-20 h-8"
          />
          <span className="text-xs text-muted-foreground">newest backups</span>
        </div>
      )}

      {mode === "SMART" && (
        <div className="grid grid-cols-4 gap-2">
          {(["daily", "weekly", "monthly", "yearly"] as const).map((period) => (
            <div key={period} className="space-y-1">
              <Label className="text-xs capitalize">{period}</Label>
              <Input
                type="number"
                min={0}
                value={smart[period]}
                onChange={(e) =>
                  setSmartField(period, parseInt(e.target.value) || 0)
                }
                className="h-8"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
