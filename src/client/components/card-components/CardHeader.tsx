import type { SubjectType } from "@/model/wanikani.ts";
import { subjectColors } from "@/config/theme.ts";
import { WanikaniLink } from "./WanikaniLink.tsx";

type CardHeaderProps = {
  subjectType: SubjectType;
  title: string;
  subtitle?: string;
  character?: string | null;
  characterImage?: React.ReactNode;
  documentUrl?: string;
  actions?: React.ReactNode;
};

export function CardHeader({
  subjectType,
  title,
  character,
  characterImage,
  documentUrl,
  actions,
}: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-2">
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 min-w-12 items-center justify-center whitespace-nowrap rounded-lg px-3 text-2xl text-white"
          style={{ backgroundColor: subjectColors[subjectType] }}
        >
          {character ?? characterImage ?? "?"}
        </div>
        <h2 className="text-3xl text-gray-900">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {documentUrl && <WanikaniLink url={documentUrl} />}
      </div>
    </div>
  );
}
