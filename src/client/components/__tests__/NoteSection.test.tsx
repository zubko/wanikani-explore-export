import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NoteSection,
  type NoteSectionProps,
} from "@client/components/card-components/NoteSection.tsx";

function render(props: Partial<NoteSectionProps> = {}): string {
  return renderToStaticMarkup(
    <NoteSection subjectId={456} field="meaning_note" wanikaniNote="" localNote={null} {...props} />
  );
}

describe("NoteSection view state", () => {
  it("shows the WaniKani note without the local tag", () => {
    const html = render({ wanikaniNote: "Kawai" });

    expect(html).toContain("Kawai");
    expect(html).toContain("Note");
    expect(html).not.toContain(">local<");
    expect(html).not.toContain("+ Add Note");
  });

  it("shows the local note with the local tag and hides the WaniKani one", () => {
    const html = render({ wanikaniNote: "Kawai", localNote: "Kawa like a river bank" });

    expect(html).toContain("Kawa like a river bank");
    expect(html).toContain(">local<");
    expect(html).not.toContain("Kawai");
  });

  it("shows the add button when there is no note at all", () => {
    const html = render();

    expect(html).toContain("+ Add Note");
    expect(html).not.toContain(">local<");
  });
});
