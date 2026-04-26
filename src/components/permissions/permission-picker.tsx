"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AVAILABLE_PERMISSIONS } from "@/lib/auth/permissions"
import { cn } from "@/lib/utils"

interface PermissionPickerProps {
  /** Currently selected permission IDs */
  value: string[]
  /** Callback when selection changes */
  onChange: (permissions: string[]) => void
  /** Prefix for checkbox IDs to avoid conflicts when multiple pickers are on the same page */
  idPrefix?: string
  /** Whether the picker is disabled */
  disabled?: boolean
}

export function PermissionPicker({
  value,
  onChange,
  idPrefix = "perm",
  disabled = false,
}: PermissionPickerProps) {
  const groupedPermissions = AVAILABLE_PERMISSIONS.reduce(
    (acc, permission) => {
      if (!acc[permission.category]) {
        acc[permission.category] = []
      }
      acc[permission.category].push(permission)
      return acc
    },
    {} as Record<string, typeof AVAILABLE_PERMISSIONS>
  )

  const totalPermissions = AVAILABLE_PERMISSIONS.length
  const selectedCount = value.length
  const allSelected = selectedCount === totalPermissions

  const toggleAll = () => {
    if (allSelected) {
      onChange([])
    } else {
      onChange(AVAILABLE_PERMISSIONS.map((p) => p.id))
    }
  }

  const toggleCategory = (category: string) => {
    const categoryPermissions = groupedPermissions[category].map((p) => p.id)
    const allCategorySelected = categoryPermissions.every((p) => value.includes(p))

    if (allCategorySelected) {
      onChange(value.filter((p) => !categoryPermissions.includes(p as typeof AVAILABLE_PERMISSIONS[number]["id"])))
    } else {
      onChange([...new Set([...value, ...categoryPermissions])])
    }
  }

  const togglePermission = (permissionId: string, checked: boolean) => {
    if (checked) {
      onChange([...value, permissionId])
    } else {
      onChange(value.filter((v) => v !== permissionId))
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge variant={selectedCount > 0 ? "default" : "secondary"}>
            {selectedCount} / {totalPermissions}
          </Badge>
          <span className="text-sm text-muted-foreground">permissions selected</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={disabled}
        >
          {allSelected ? "Deselect All" : "Select All"}
        </Button>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(groupedPermissions).map(([category, permissions]) => {
          const categorySelected = permissions.filter((p) => value.includes(p.id)).length
          const allCategorySelected = categorySelected === permissions.length

          return (
            <div
              key={category}
              className={cn(
                "rounded-lg border p-3 space-y-2.5 transition-colors",
                allCategorySelected && "border-primary/50 bg-primary/5"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm">{category}</h4>
                  {categorySelected > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {categorySelected}/{permissions.length}
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => toggleCategory(category)}
                  disabled={disabled}
                >
                  {allCategorySelected ? "None" : "All"}
                </Button>
              </div>
              <div className="space-y-0.5">
                {permissions.map((permission) => (
                  <label
                    key={permission.id}
                    htmlFor={`${idPrefix}-${permission.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <Checkbox
                      id={`${idPrefix}-${permission.id}`}
                      checked={value.includes(permission.id)}
                      onCheckedChange={(checked) =>
                        togglePermission(permission.id, !!checked)
                      }
                      disabled={disabled}
                    />
                    <span className="text-sm leading-tight">{permission.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
