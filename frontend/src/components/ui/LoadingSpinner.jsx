export default function LoadingSpinner({ size = "md", text = "" }) {
  const sizeClass = {
    sm: "w-4 h-4",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  }[size];

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`${sizeClass} border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin`} />
      {text && <p className="text-sm text-slate-600">{text}</p>}
    </div>
  );
}