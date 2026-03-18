export function LabeledRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className={`text-sm ${bold ? "font-medium" : ""} text-gray-900`}>{value}</span>
    </div>
  );
}
