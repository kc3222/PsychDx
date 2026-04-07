import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PsychDx — Auth",
  description: "Sign in to test Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <a href="/">Home</a>
          <a href="/login">Log in</a>
          <a href="/signup">Sign up</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
