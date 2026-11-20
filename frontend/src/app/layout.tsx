import type { Metadata } from "next";
import ThemeProvider from "../components/ThemeProvider";
import AuthProvider from "../components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Importadora ERP - Admin",
  description: "Sistema de Gestión Administrativa y de Importaciones",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>
        <AuthProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
