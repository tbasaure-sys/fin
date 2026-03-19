import "./globals.css";

export const metadata = {
  title: "BLS Prime",
  description: "Decision support workspace for clearer portfolio moves, risk control, and opportunity discovery.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
