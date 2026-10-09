"use client";

import { useEffect, useMemo } from "react";
import { Camera, X } from "lucide-react";
import { useToast } from "./providers";
import { cx } from "./ui";

/** Optional food photo. The parse call uploads it; the preview stays local. */
export function PhotoInput({ file, onChange, disabled }: { file: File | null; onChange: (f: File | null) => void; disabled?: boolean }) {
  const toast = useToast();
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (file && preview) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-navy/15 bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
        <img src={preview} alt="Selected food photo" className="size-20 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy">{file.name}</p>
          <p className="text-xs text-navy/60">{(file.size / 1024 / 1024).toFixed(1)} MB · sent with your message</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="rounded-xl p-2 text-navy/70 hover:bg-navy/5 hover:text-navy"
          aria-label="Remove photo"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <label
      className={cx(
        "flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-blue/40 bg-white px-4 py-3.5",
        "text-blue transition-colors hover:border-blue hover:bg-blue/5",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <Camera className="size-5 shrink-0" aria-hidden />
      <span className="text-[15px] font-semibold">Add a photo of the food</span>
      <span className="ml-auto text-sm text-navy/50">Optional</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && f.size > 8 * 1024 * 1024) {
            e.target.value = "";
            toast("Please choose a photo under 8 MB.", "error");
            return;
          }
          onChange(f);
        }}
      />
    </label>
  );
}
