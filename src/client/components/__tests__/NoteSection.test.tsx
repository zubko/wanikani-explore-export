import { describe, expect, it, beforeEach, afterEach, afterAll } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { click, mount, pressKey, settle, typeInto } from "@/test/render.ts";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import {
  NoteSection,
  type NoteSectionProps,
} from "@client/components/card-components/NoteSection.tsx";
import { resetLocalStudyMaterials } from "@client/hooks/useLocalStudyMaterial.ts";

const apiMock: ApiMock = installApiMock();

function props(overrides: Partial<NoteSectionProps> = {}): NoteSectionProps {
  return {
    subjectId: 456,
    field: "reading_note",
    wanikaniNote: "",
    localStudyMaterial: null,
    ...overrides,
  };
}

function renderStatic(overrides: Partial<NoteSectionProps> = {}): string {
  return renderToStaticMarkup(<NoteSection {...props(overrides)} />);
}

beforeEach(() => {
  apiMock.reset();
  resetLocalStudyMaterials();
});

afterEach(() => {
  resetLocalStudyMaterials();
});

afterAll(() => {
  apiMock.restore();
});

describe("NoteSection view state", () => {
  it("shows the WaniKani note without the local tag", () => {
    const html = renderStatic({ wanikaniNote: "Kawai" });

    expect(html).toContain("Kawai");
    expect(html).toContain(">Note<");
    expect(html).not.toContain(">local<");
    expect(html).not.toContain("+ Add Note");
  });

  it("shows the local note with the local tag and hides the WaniKani one", () => {
    const html = renderStatic({
      wanikaniNote: "Kawai",
      localStudyMaterial: { reading_note: "Kawa like a river bank" },
    });

    expect(html).toContain("Kawa like a river bank");
    expect(html).toContain(">local<");
    expect(html).not.toContain("Kawai");
  });

  it("keeps the Note header on the add button", () => {
    const html = renderStatic();

    expect(html).toContain("+ Add Note");
    expect(html).toContain(">Note<");
    expect(html).not.toContain(">local<");
  });
});

describe("NoteSection editing", () => {
  it("pre-fills the draft with the shown note", () => {
    const view = mount(<NoteSection {...props({ wanikaniNote: "Kawai" })} />);

    click(view.findByLabel("Edit note"));

    expect(view.find<HTMLTextAreaElement>("textarea").value).toBe("Kawai");
    view.unmount();
  });

  it("saves the trimmed draft and shows it as local", async () => {
    apiMock.answerWith({ reading_note: "My own note" });
    const view = mount(<NoteSection {...props({ wanikaniNote: "Kawai" })} />);

    click(view.findByLabel("Edit note"));
    typeInto(view.find("textarea"), "  My own note  ");
    click(view.findByLabel("Save note"));
    await settle();

    expect(apiMock.requests).toEqual([{ id: 456, reading_note: "My own note" }]);
    expect(view.html()).toContain("My own note");
    expect(view.html()).toContain(">local<");
    view.unmount();
  });

  it("saves with Cmd+Enter and cancels with Esc", async () => {
    apiMock.answerWith({ reading_note: "Typed" });
    const view = mount(<NoteSection {...props()} />);

    click(view.findByLabel("+ Add Note"));
    typeInto(view.find("textarea"), "Typed");
    pressKey(view.find("textarea"), "Enter", true);
    await settle();
    expect(apiMock.requests).toEqual([{ id: 456, reading_note: "Typed" }]);

    click(view.findByLabel("Edit note"));
    typeInto(view.find("textarea"), "Dropped");
    pressKey(view.find("textarea"), "Escape");

    expect(view.html()).toContain("Typed");
    expect(view.html()).not.toContain("Dropped");
    view.unmount();
  });

  it("drops the draft on cancel", () => {
    const view = mount(<NoteSection {...props({ wanikaniNote: "Kawai" })} />);

    click(view.findByLabel("Edit note"));
    typeInto(view.find("textarea"), "Dropped");
    click(view.findByLabel("Cancel"));
    click(view.findByLabel("Edit note"));

    expect(view.find<HTMLTextAreaElement>("textarea").value).toBe("Kawai");
    view.unmount();
  });

  it("an empty draft clears the local note and shows the WaniKani one again", async () => {
    apiMock.answerWith(null);
    const view = mount(
      <NoteSection
        {...props({ wanikaniNote: "Kawai", localStudyMaterial: { reading_note: "Mine" } })}
      />
    );

    click(view.findByLabel("Edit note"));
    typeInto(view.find("textarea"), "");
    click(view.findByLabel("Save note"));
    await settle();

    expect(apiMock.requests).toEqual([{ id: 456, reading_note: "" }]);
    expect(view.html()).toContain("Kawai");
    expect(view.html()).not.toContain(">local<");
    view.unmount();
  });

  it("puts the old note back and reopens the editor when the save fails", async () => {
    apiMock.failWith("Server error (500)");
    const view = mount(
      <NoteSection
        {...props({ wanikaniNote: "Kawai", localStudyMaterial: { reading_note: "Saved" } })}
      />
    );

    click(view.findByLabel("Edit note"));
    typeInto(view.find("textarea"), "Never saved");
    click(view.findByLabel("Save note"));
    await settle();

    expect(view.find<HTMLTextAreaElement>("textarea").value).toBe("Never saved");

    click(view.findByLabel("Cancel"));

    expect(view.html()).toContain("Saved");
    expect(view.html()).not.toContain("Never saved");
    view.unmount();
  });

  it("shows the same saved note on two cards of one subject", async () => {
    apiMock.answerWith({ reading_note: "Shared" });
    const first = mount(<NoteSection {...props()} />);
    const second = mount(<NoteSection {...props()} />);

    click(first.findByLabel("+ Add Note"));
    typeInto(first.find("textarea"), "Shared");
    click(first.findByLabel("Save note"));
    await settle();

    expect(second.html()).toContain("Shared");
    expect(second.html()).toContain(">local<");
    first.unmount();
    second.unmount();
  });
});
