import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

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
  const total = modalities.length;
  const allSelected = selected.length === total && total > 0;

  function toggleAll() {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(modalities.map((m) => m.slug));
    }
  }

  function toggle(slug: string) {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      onChange([...selected, slug]);
    }
  }

  function isChecked(slug: string) {
    return selected.includes(slug);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Modalidades
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
