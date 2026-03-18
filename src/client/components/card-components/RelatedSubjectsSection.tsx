import { useState } from "react";
import type { SubjectReference } from "@/model/wanikani.ts";
import type { SearchableType } from "../../types.ts";
import { useSearch } from "../../context/SearchContext.tsx";
import { SubjectTile } from "./SubjectTile.tsx";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

type RelatedSubjectsSectionProps = {
  title: string;
  items: SubjectReference[];
  subjectType: SearchableType;
  color: string;
};

export function RelatedSubjectsSection({
  title,
  items,
  subjectType,
  color,
}: RelatedSubjectsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { navigateTo } = useSearch();

  if (items.length === 0) return null;

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex cursor-pointer items-center gap-1.5"
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={20}
          className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
        <h3 className="text-2xl text-gray-900">{title}</h3>
      </button>
      {isOpen && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <SubjectTile
              key={item.id}
              characters={item.characters}
              reading={item.reading}
              meaning={item.meaning}
              color={color}
              onClick={() => navigateTo(subjectType, item.characters)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
