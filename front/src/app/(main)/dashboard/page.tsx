export default function DashboardHomePage() {
  return (
    <div className="flex items-center justify-center" style={{ height: "calc(100vh - 4rem)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.jpeg"
        alt="Pazini Engenharia"
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}
