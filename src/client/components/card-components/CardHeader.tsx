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
    <div className="flex items-center justify-between px-4 pt-4 pb-2 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-3 max-sm:pt-3">
      <div className="flex items-center gap-3 max-sm:contents">
        <div
          className="flex h-12 min-w-12 items-center justify-center whitespace-nowrap rounded-lg px-3 text-2xl text-white max-sm:h-auto max-sm:min-h-12 max-sm:justify-self-start max-sm:whitespace-normal"
          style={{ backgroundColor: subjectColors[subjectType] }}
        >
          {character ?? characterImage ?? "?"}
        </div>
        <h2 className="text-3xl text-gray-900 max-sm:col-span-2 max-sm:row-start-2">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {documentUrl && <WanikaniLink url={documentUrl} />}
      </div>
    </div>
  );
}
