export function LayoutFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border px-6 py-3 text-xs text-muted-foreground text-center">
      &copy; icore {year}
    </footer>
  );
}
