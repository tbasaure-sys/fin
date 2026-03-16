import "./globals.css";

export const metadata = {
  title: "BLS Prime",
  description: "Retail decision terminal for structural market intelligence.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

