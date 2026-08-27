export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className="min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      data-testid="studio-shell"
    >
      {children}
    </div>
  );
}
