import { MnemonicText } from "./MnemonicText.tsx";

export function ExplanationBlock({ mnemonic }: { mnemonic: string }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-medium text-gray-500">Explanation</h4>
      <MnemonicText html={mnemonic} />
    </div>
  );
}
