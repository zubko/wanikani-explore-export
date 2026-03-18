import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

type SearchInputProps = {
  onSearch: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  initialValue?: string;
};

export function SearchInput({
  onSearch,
  placeholder,
  disabled,
  initialValue = "",
}: SearchInputProps) {
  const [query, setQuery] = useState(initialValue);

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  const handleSubmit = () => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-1 gap-1.5">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Search..."}
        disabled={disabled}
        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-lg focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !query.trim()}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        <HugeiconsIcon icon={Search01Icon} size={20} />
      </button>
    </div>
  );
}
