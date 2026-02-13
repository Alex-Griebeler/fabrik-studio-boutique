import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface Modality {
  id: string;
  name: string;
  slug: string;
  color: string;
}

interface Props {
  modalities: Modality[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function ModalityFilterPopover({ modalities, selected, onChange }: Props) {
  const allSelected = selected.length === 0;
  const count = selected.length;
  const total = modalities.length;

  const label = allSelected ? "Modalidades" : `${count} de ${total}`;

  function toggleAll() {
    onChange([]);
  }

  function toggle(slug: string) {
    if (allSelected) {
      // switching from "all" to all-except-one
      onChange(modalities.filter((m) => m.slug !== slug).map((m) => m.slug));
    } else if (selected.includes(slug)) {
      const next = selected.filter((s) => s !== slug);
      // if removing makes it empty or all selected, reset to all
      if (next.length === 0) {
        onChange([]);
      } else {
        onChange(next);
      }
    } else {
      const next = [...selected, slug];
      if (next.length === total) {
        onChange([]);
      } else {
        onChange(next);
      }
    }
  }

  function isChecked(slug: string) {
    return allSelected || selected.includes(slug);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          {label}
          {!allSelected && (
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] leading-none">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <button
          onClick={toggleAll}
          className="flex items-center gap-2.5 w-full rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          <span className="font-medium">Todas</span>
        </button>

        <div className="h-px bg-border my-1" />

        {modalities.map((m) => (
          <button
            key={m.id}
            onClick={() => toggle(m.slug)}
            className="flex items-center gap-2.5 w-full rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <Checkbox checked={isChecked(m.slug)} onCheckedChange={() => toggle(m.slug)} />
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: m.color }}
            />
            <span className="truncate">{m.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
