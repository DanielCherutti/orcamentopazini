"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";

interface EditableTitleProps {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
  /** Somente leitura (sem edição). */
  disabled?: boolean;
}

export function EditableTitle({ value, onSave, className = "", disabled = false }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  };

  if (disabled) {
    return <span className={className}>{value}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`bg-transparent border-b-2 border-primary outline-none ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group flex items-center gap-2 text-left cursor-pointer hover:opacity-80 transition-opacity ${className}`}
    >
      <span>{value}</span>
      <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
    </button>
  );
}
