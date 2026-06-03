import "./globals.css";

export const metadata = {
  title: "AasaMedChem | Inventory & Order Management",
  description: "High-precision inventory and order management system with multi-unit conversions for chemical products.",
  keywords: "chemical, inventory, orders, unit conversion, high precision, AasaMedChem",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
