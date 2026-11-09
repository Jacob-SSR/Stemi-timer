"use client";
import { useEffect, useState } from "react";
import { clockValue, timestampFromClock } from "@/lib/workflow";
import { thaiTime } from "@/lib/model";
export default function InlineTime({
  label,
  time,
  now,
  disabled,
  save,
}: {
  label: string;
  time: number | null;
  now: number;
  disabled: boolean;
  save: (t: number) => Promise<boolean>;
}) {
  const [value, setValue] = useState(clockValue(time));
  useEffect(() => setValue(clockValue(time)), [time]);
  return (
    <input
      className="inline-time"
      type="time"
      step="1"
      aria-label={"เวลา " + label}
      title={
        time == null
          ? "กรอกเวลาแล้วออกจากช่องเพื่อบันทึก"
          : thaiTime(time, true)
      }
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        if (!value) {
          setValue(clockValue(time));
          return;
        }
        if (value === clockValue(time)) return;
        const t = timestampFromClock(value, time ?? now);
        if (t == null || !(await save(t))) setValue(clockValue(time));
      }}
    />
  );
}
