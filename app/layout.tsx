import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: { default: "TV Time", template: "%s · TV Time" },
  description:
    "Track the shows you watch, see what's coming up, and catch up on episodes you've missed.",
  applicationName: "TV Time",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TV Time",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0e17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ServiceWorkerRegistrar />
        <Nav />
        <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 md:pb-10 md:pt-8">
          {children}
        </main>
      </body>
    </html>
  );
}
