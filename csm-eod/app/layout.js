import './globals.css';

export const metadata = {
  title: 'CSM End of Day',
  description: 'Prefilled CSM EOD — demo',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
