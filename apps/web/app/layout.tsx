import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BuildPilot — AI Engineering Control Plane',
  description: 'Self-hosted AI engineering control plane for autonomous software delivery',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

