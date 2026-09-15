import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  UserSynonymsRow,
  type UserSynonymsRowProps,
} from "@client/components/card-components/UserSynonymsRow.tsx";

function render(props: Partial<UserSynonymsRowProps> = {}): string {
  return renderToStaticMarkup(
    <UserSynonymsRow subjectId={2478} wanikaniSynonyms={[]} localSynonyms={[]} {...props} />
  );
}

describe("UserSynonymsRow view state", () => {
  it("shows a WaniKani synonym without a remove button", () => {
    const html = render({ wanikaniSynonyms: ["usa person"] });

    expect(html).toContain("usa person");
    expect(html).not.toContain("Remove usa person");
  });

  it("shows a local synonym with a remove button", () => {
    const html = render({ wanikaniSynonyms: ["usa person"], localSynonyms: ["american"] });

    expect(html).toContain("american");
    expect(html).toContain("Remove american");
    expect(html).not.toContain("Remove usa person");
  });

  it("shows only the add button when both lists are empty", () => {
    const html = render();

    expect(html).toContain("+ Add Synonym");
    expect(html).not.toContain("Remove ");
  });
});
