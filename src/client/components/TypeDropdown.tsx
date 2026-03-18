import { useState, useRef, useEffect } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type TypeDropdownOption<T extends string> = {
  value: T;
  label: string;
  title: string;
  color: string;
};

type TypeDropdownProps<T extends string> = {
  options: TypeDropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function TypeDropdown<T extends string>({ options, value, onChange }: TypeDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = (options.find((opt) => opt.value === value) ?? options[0])!;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  function handleSelect(optionValue: T) {
    onChange(optionValue);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ backgroundColor: selectedOption.color }}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow transition-colors hover:opacity-90"
      >
        <span>{selectedOption.label}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={16}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 overflow-hidden rounded-lg bg-white shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              style={{ backgroundColor: option.color }}
              className={`flex w-full flex-col items-start px-4 py-2 text-white transition-opacity hover:opacity-90 ${
                option.value === value ? "opacity-100" : "opacity-80"
              }`}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="whitespace-nowrap text-left text-xs opacity-75">{option.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
