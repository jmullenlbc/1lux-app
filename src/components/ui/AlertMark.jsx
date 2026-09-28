// The one alert symbol (Mike 9-27): a red circle with a white "!". Use it
// wherever something needs a person's attention before it can go ahead.
export default function AlertMark({ label = 'Needs attention', size = 16, className = '' }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-red-600 text-white font-bold leading-none select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.7) }}
    >
      !
    </span>
  );
}
