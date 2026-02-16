import { useState } from "react";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useBankAccounts, useDeleteBankAccount, type BankAccount } from "@/hooks/useBankAccounts";
import { BankAccountFormDialog } from "./BankAccountFormDialog";
import { formatCents } from "@/hooks/usePlans";

export function BankAccountManager() {
  const { data: accounts, isLoading } = useBankAccounts(false);
  const deleteBankAccount = useDeleteBankAccount();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Contas Bancárias</h3>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Conta
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : !accounts?.length ? (
        <p className="text-muted-foreground text-sm py-6 text-center">Nenhuma conta bancária cadastrada</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc) => (
            <Card key={acc.id} className={!acc.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">{acc.name}</CardTitle>
                  {!acc.is_active && <Badge variant="outline" className="text-xs">Inativa</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(acc); setDialogOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir conta bancária?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteBankAccount.mutate(acc.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                {acc.bank_name && <p>Banco: {acc.bank_name} {acc.bank_code ? `(${acc.bank_code})` : ""}</p>}
                {acc.branch && <p>Ag: {acc.branch} | Conta: {acc.account_number || "—"}</p>}
                {acc.pix_key && <p>PIX: {acc.pix_key}</p>}
                <p className="text-sm font-medium text-foreground pt-1">Saldo: {formatCents(acc.current_balance_cents)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BankAccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
    </div>
  );
}
