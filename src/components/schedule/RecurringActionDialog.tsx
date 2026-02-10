import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type RecurringAction = "this" | "this_and_following" | "all";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSelect: (action: RecurringAction) => void;
  isPending?: boolean;
  variant?: "edit" | "delete";
}

export function RecurringActionDialog({
  open,
  onOpenChange,
  title,
  description,
  onSelect,
  isPending,
  variant = "edit",
}: Props) {
  const isDelete = variant === "delete";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <Button
            variant="outline"
            onClick={() => onSelect("this")}
            disabled={isPending}
            className="justify-start"
          >
            {isDelete ? "Excluir este evento" : "Editar este evento"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onSelect("this_and_following")}
            disabled={isPending}
            className="justify-start"
          >
            {isDelete ? "Excluir este e os seguintes" : "Editar este e os seguintes"}
          </Button>
          <Button
            variant={isDelete ? "destructive" : "outline"}
            onClick={() => onSelect("all")}
            disabled={isPending}
            className="justify-start"
          >
            {isDelete ? "Excluir todos os eventos" : "Editar todos os eventos"}
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
