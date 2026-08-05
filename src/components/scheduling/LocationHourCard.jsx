import React from "react";

export default function LocationHourCard({ location, hours }) {
  const maxHours = location.max_hours_per_week || null;
  const isOverMax = maxHours && hours > maxHours;
  const isAtMax = maxHours && hours === maxHours;

  let cardClass = 'bg-slate-50 border-slate-200';
  let hoursColor = 'text-slate-900';
  let statusLabel = null;

  if (maxHours) {
    if (isOverMax) {
      cardClass = 'bg-red-50 border-red-300';
      hoursColor = 'text-red-600';
      statusLabel = <span className="text-red-600 font-bold">⚠️ OVER LIMIT</span>;
    } else if (isAtMax) {
      cardClass = 'bg-green-50 border-green-300';
      hoursColor = 'text-green-700';
      statusLabel = <span className="text-green-600 font-bold">✓ AT MAX</span>;
    } else {
      cardClass = 'bg-blue-50 border-blue-300';
      hoursColor = 'text-blue-700';
      statusLabel = <span className="text-blue-600 font-bold">Under Max</span>;
    }
  }

  return (
    <div className={`p-4 rounded-lg border-2 ${cardClass}`}>
      <p className="font-semibold text-slate-900 mb-1">{location.site_name}</p>
      <p className={`text-2xl font-bold ${hoursColor}`}>
        {hours.toFixed(1)} hrs
      </p>
      {maxHours !== null && maxHours !== undefined && (
        <p className="text-xs text-slate-600 mt-1">
          Max: {maxHours} hrs/week {statusLabel}
        </p>
      )}
    </div>
  );
}