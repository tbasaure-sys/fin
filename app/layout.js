import "./globals.css";

const appName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "Allocator Workspace";

export const metadata = {
  title: appName,
  description: "Decision support workspace for clearer portfolio moves, risk control, and opportunity discovery.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
