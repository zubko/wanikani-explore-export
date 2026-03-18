import { MnemonicText } from "./MnemonicText.tsx";

export function HintBox({ hint }: { hint: string }) {
  return (
    <div className="rounded-lg bg-gray-100 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-gray-500">&#9432;</span>
        <span className="font-medium text-gray-700">Hints</span>
      </div>
      <MnemonicText html={hint} />
    </div>
  );
}
