import { useRef } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useStudentImport } from "@/hooks/useStudentImport";

const STUDENT_FIELDS = [
  { value: "full_name", label: "Nome completo" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "cpf", label: "CPF" },
  { value: "date_of_birth", label: "Data de nascimento" },
  { value: "neighborhood", label: "Bairro" },
  { value: "city", label: "Cidade" },
  { value: "plan_name", label: "Plano (nota)" },
  { value: "created_at_evo", label: "Data cadastro (nota)" },
  { value: "contract_end", label: "Venc. contrato (nota)" },
  { value: "_ignore", label: "— Ignorar —" },
];

export default function Import() {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    rows,
    headers,
    mapping,
    setMapping,
    importing,
    result,
    parseFile,
    importStudents,
  } = useStudentImport();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const updateMapping = (header: string, field: string) => {
    setMapping((prev) => ({ ...prev, [header]: field }));
  };

  const hasName = Object.values(mapping).includes("full_name");
  const previewRows = rows.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar Alunos"
        description="Migração do sistema Evo via CSV/Excel"
      />

      {/* Step 1: Upload */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">1. Upload do arquivo</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Exporte o relatório de clientes do Evo em formato .xlsx ou .csv e faça o upload aqui.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />
        <Button onClick={() => fileRef.current?.click()} variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Selecionar arquivo
        </Button>
        {rows.length > 0 && (
          <Badge variant="secondary" className="ml-3">
            {rows.length} registros encontrados
          </Badge>
        )}
      </Card>

      {/* Step 2: Column Mapping */}
      {headers.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-semibold text-lg">2. Mapeamento de colunas</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Verifique se as colunas do Evo estão mapeadas corretamente para os campos do sistema.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {headers.map((h) => (
              <div key={h} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground truncate">
                  {h}
                </label>
                <Select
                  value={mapping[h] ?? "_ignore"}
                  onValueChange={(v) => updateMapping(h, v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STUDENT_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Step 3: Preview */}
      {previewRows.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-semibold text-lg">3. Pré-visualização (5 primeiros)</h3>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers
                    .filter((h) => mapping[h] && mapping[h] !== "_ignore")
                    .map((h) => (
                      <TableHead key={h} className="text-xs whitespace-nowrap">
                        {STUDENT_FIELDS.find((f) => f.value === mapping[h])?.label ?? h}
                      </TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, i) => (
                  <TableRow key={i}>
                    {headers
                      .filter((h) => mapping[h] && mapping[h] !== "_ignore")
                      .map((h) => (
                        <TableCell key={h} className="text-xs whitespace-nowrap">
                          {String(row[h] ?? "")}
                        </TableCell>
                      ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Step 4: Import */}
      {rows.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-semibold text-lg">4. Importar</h3>
          </div>
          {!hasName && (
            <p className="text-sm text-destructive mb-3">
              ⚠️ Mapeie pelo menos a coluna "Nome completo" para continuar.
            </p>
          )}
          <Button
            onClick={importStudents}
            disabled={!hasName || importing}
            size="lg"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar {rows.length} alunos
              </>
            )}
          </Button>
        </Card>
      )}

      {/* Results */}
      {result && (
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Resultado da importação</h3>
          <div className="flex gap-4 mb-4">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">{result.success} importados</span>
            </div>
            {result.skipped > 0 && (
              <div className="flex items-center gap-2 text-accent-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">{result.skipped} duplicados</span>
              </div>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="max-h-60 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Linha</TableHead>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{e.row}</TableCell>
                      <TableCell className="text-xs">{e.name}</TableCell>
                      <TableCell className="text-xs text-destructive">{e.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
