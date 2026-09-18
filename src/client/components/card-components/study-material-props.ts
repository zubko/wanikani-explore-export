import type {
  AuxiliaryMeaning,
  LocalStudyMaterial,
  Meaning,
  StudyMaterial,
} from "@/model/wanikani.ts";
import type { NoteSectionProps } from "./NoteSection.tsx";
import type { UserSynonymsRowProps } from "./UserSynonymsRow.tsx";

type SubjectWithStudyMaterial = {
  id: number;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  studyMaterial: StudyMaterial | null;
  localStudyMaterial: LocalStudyMaterial | null;
};

export function noteProps(
  subject: SubjectWithStudyMaterial,
  field: NoteSectionProps["field"]
): NoteSectionProps {
  return {
    subjectId: subject.id,
    field,
    wanikaniNote: subject.studyMaterial?.data[field] ?? "",
    localStudyMaterial: subject.localStudyMaterial,
  };
}

export function synonymProps(subject: SubjectWithStudyMaterial): UserSynonymsRowProps {
  return {
    subjectId: subject.id,
    wanikaniSynonyms: subject.studyMaterial?.data.meaning_synonyms ?? [],
    subjectMeanings: [
      ...subject.meanings.map((item) => item.meaning),
      ...subject.auxiliaryMeanings.map((item) => item.meaning),
    ],
    localStudyMaterial: subject.localStudyMaterial,
  };
}
