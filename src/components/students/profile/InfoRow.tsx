interface InfoRowProps {
  label: string;
  value: string | null | undefined;
  icon?: React.ReactNode;
}

export function InfoRow({ label, value, icon }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={value ? "text-foreground" : "text-muted-foreground/60 italic"}>
          {value || "Não informado"}
        </p>
      </div>
    </div>
  );
}
