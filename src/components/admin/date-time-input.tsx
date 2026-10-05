"use client";

interface Props {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}

/** Displays a 12-hour clock while preserving the form's local ISO date value. */
export function DateTimeInput({ label, name, value, onChange }: Props) {
  const [date = "", time = "00:00"] = value.split("T");
  const [hours = "00", minutes = "00"] = time.split(":");
  const hour24 = Number(hours);
  const period = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;

  const updateTime = (hour: number, minute: string, nextPeriod: string) => {
    const nextHour = hour % 12 + (nextPeriod === "pm" ? 12 : 0);
    onChange(`${date}T${String(nextHour).padStart(2, "0")}:${minute}`);
  };

  return (
    <div className="field">
      <label htmlFor={`${name}-date`}>{label}</label>
      <input type="hidden" name={name} value={value} />
      <input
        id={`${name}-date`}
        type="date"
        value={date}
        onChange={(event) => onChange(event.target.value ? `${event.target.value}T${time}` : "")}
      />
      <div className="date-time-clock" role="group" aria-label={`Hora de ${label.toLowerCase()}`}>
        <select aria-label={`Hora (${label})`} disabled={!date} value={hour12} onChange={(event) => updateTime(Number(event.target.value), minutes, period)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => <option key={hour} value={hour}>{hour}</option>)}
        </select>
        <span aria-hidden="true">:</span>
        <select aria-label={`Minutos (${label})`} disabled={!date} value={minutes} onChange={(event) => updateTime(hour12, event.target.value, period)}>
          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(minute => <option key={minute} value={minute}>{minute}</option>)}
        </select>
        <select aria-label={`Período (${label})`} disabled={!date} value={period} onChange={(event) => updateTime(hour12, minutes, event.target.value)}>
          <option value="am">a. m.</option>
          <option value="pm">p. m.</option>
        </select>
      </div>
    </div>
  );
}
