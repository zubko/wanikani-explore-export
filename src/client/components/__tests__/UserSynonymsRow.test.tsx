import { describe, expect, it, beforeEach, afterEach, afterAll } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { click, mount, pressKey, settle, typeInto } from "@/test/render.ts";
import { installApiMock, type ApiMock } from "@/test/api-mock.ts";
import {
  UserSynonymsRow,
  type UserSynonymsRowProps,
} from "@client/components/card-components/UserSynonymsRow.tsx";
import { resetLocalStudyMaterials } from "@client/hooks/useLocalStudyMaterial.ts";

const apiMock: ApiMock = installApiMock();

function props(overrides: Partial<UserSynonymsRowProps> = {}): UserSynonymsRowProps {
  return {
    subjectId: 2478,
    wanikaniSynonyms: [],
    localStudyMaterial: null,
    ...overrides,
  };
}

function renderStatic(overrides: Partial<UserSynonymsRowProps> = {}): string {
  return renderToStaticMarkup(<UserSynonymsRow {...props(overrides)} />);
}

function addSynonym(view: ReturnType<typeof mount>, word: string): void {
  click(view.findByLabel("+ Add Synonym"));
  typeInto(view.find("input"), word);
  pressKey(view.find("input"), "Enter");
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

describe("UserSynonymsRow view state", () => {
  it("shows a WaniKani synonym without a remove button", () => {
    const html = renderStatic({ wanikaniSynonyms: ["usa person"] });

    expect(html).toContain("usa person");
    expect(html).not.toContain("Remove usa person");
  });

  it("shows a local synonym with a remove button", () => {
    const html = renderStatic({
      wanikaniSynonyms: ["usa person"],
      localStudyMaterial: { meaning_synonyms: ["american"] },
    });

    expect(html).toContain("american");
    expect(html).toContain("Remove american");
    expect(html).not.toContain("Remove usa person");
  });

  it("shows a local synonym when there is no WaniKani one", () => {
    const html = renderStatic({ localStudyMaterial: { meaning_synonyms: ["american"] } });

    expect(html).toContain("Remove american");
  });

  it("shows a local synonym that WaniKani also has only once", () => {
    const html = renderStatic({
      wanikaniSynonyms: ["american"],
      localStudyMaterial: { meaning_synonyms: ["american"] },
    });

    expect(html.split("american")).toHaveLength(2);
    expect(html).not.toContain("Remove american");
  });

  it("shows only the add button when both lists are empty", () => {
    const html = renderStatic();

    expect(html).toContain("+ Add Synonym");
    expect(html).not.toContain("Remove");
  });

  it("shows the hint when one is given", () => {
    expect(renderStatic({ hint: "not in Anki" })).toContain("not in Anki");
    expect(renderStatic()).not.toContain("not in Anki");
  });
});

describe("UserSynonymsRow editing", () => {
  it("adds a synonym and sends the whole list", async () => {
    apiMock.answerWith({ meaning_synonyms: ["american", "yank"] });
    const view = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );

    addSynonym(view, "  yank  ");
    await settle();

    expect(apiMock.requests).toEqual([{ id: 2478, meaning_synonyms: ["american", "yank"] }]);
    expect(view.html()).toContain("Remove yank");
    view.unmount();
  });

  it("closes the input on Esc without sending anything", () => {
    const view = mount(<UserSynonymsRow {...props()} />);

    click(view.findByLabel("+ Add Synonym"));
    typeInto(view.find("input"), "yank");
    pressKey(view.find("input"), "Escape");

    expect(apiMock.requests).toEqual([]);
    expect(view.html()).toContain("+ Add Synonym");
    expect(view.html()).not.toContain("yank");
    view.unmount();
  });

  it("refuses a word that is already a synonym", () => {
    const view = mount(
      <UserSynonymsRow
        {...props({
          wanikaniSynonyms: ["usa person"],
          localStudyMaterial: { meaning_synonyms: ["american"] },
        })}
      />
    );

    addSynonym(view, "american");
    addSynonym(view, "usa person");

    expect(apiMock.requests).toEqual([]);
    view.unmount();
  });

  it("removes only the clicked synonym", async () => {
    apiMock.answerWith({ meaning_synonyms: ["yank"] });
    const view = mount(
      <UserSynonymsRow
        {...props({ localStudyMaterial: { meaning_synonyms: ["american", "yank"] } })}
      />
    );

    click(view.findByLabel("Remove american"));
    await settle();

    expect(apiMock.requests).toEqual([{ id: 2478, meaning_synonyms: ["yank"] }]);
    expect(view.html()).toContain("Remove yank");
    expect(view.html()).not.toContain("Remove american");
    view.unmount();
  });

  it("puts the old list back when the save fails", async () => {
    apiMock.failWith("Server error (500)");
    const view = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );

    addSynonym(view, "yank");
    await settle();

    expect(view.html()).toContain("Remove american");
    expect(view.html()).not.toContain("Remove yank");
    view.unmount();
  });

  it("keeps two cards of one subject on the same list", async () => {
    apiMock.answerWith({ meaning_synonyms: ["american", "yank"] });
    const first = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );
    const second = mount(
      <UserSynonymsRow {...props({ localStudyMaterial: { meaning_synonyms: ["american"] } })} />
    );

    addSynonym(first, "yank");
    await settle();

    apiMock.answerWith({ meaning_synonyms: ["american", "yank", "statesider"] });
    addSynonym(second, "statesider");
    await settle();

    expect(apiMock.requests).toEqual([
      { id: 2478, meaning_synonyms: ["american", "yank"] },
      { id: 2478, meaning_synonyms: ["american", "yank", "statesider"] },
    ]);
    expect(first.html()).toContain("Remove statesider");
    first.unmount();
    second.unmount();
  });
});
