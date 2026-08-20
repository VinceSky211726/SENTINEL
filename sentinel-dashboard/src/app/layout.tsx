import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { Metadata } from "next";
import "./globals.css";
import { PhoneShell } from "@/components/shell/PhoneShell";
import { TabBar } from "@/components/shell/TabBar";
import { AppBar } from "@/components/shell/AppBar";
import { StatusBar } from "@/components/shell/StatusBar";
import { AppProviders } from "@/components/shell/AppProviders";
import { Toast } from "@/components/shell/Toast";
import { TutorialSheet } from "@/components/tutorial/TutorialSheet";
import { fetchUnreadCount } from "@/lib/queries";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Sentinel",
  description: "Veille financière personnelle",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let unreadCount = 0;
  try {
    unreadCount = await fetchUnreadCount();
  } catch {
    unreadCount = 0;
  }

  return (
    <html lang="fr">
      <body
        className={`${plexSans.variable} ${plexMono.variable} font-sans antialiased`}
      >
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-void px-4 py-8 max-md:gap-0 max-md:p-0">
          <AppProviders>
            <PhoneShell>
              <StatusBar />
              <AppBar />
              <div className="view-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-3">
                {children}
              </div>
              <Toast />
              <TutorialSheet />
              <TabBar initialUnread={unreadCount} />
            </PhoneShell>
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
