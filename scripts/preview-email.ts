import { customerEmail } from "@/lib/orders/email-html";
const theme = { light: "#fbe9e4", dark: "#2b2330", accent: "#7d4f9c" };
const r = customerEmail({
  name: "Kari",
  code: "MK-2042",
  locale: "no",
  items: [{ productName: "Vietri flat tallerken", quantity: 2, unitPriceCents: 95000, currency: "NOK", configCode: "MK-B-T-P" }],
  setUrl: "https://minkeramikk.vercel.app/no/order?code=MK-2042&set=xyz",
  theme,
  baseUrl: "https://minkeramikk.vercel.app",
});
require("fs").writeFileSync("/sessions/inspiring-trusting-sagan/mnt/outputs/email-preview.html", r.html);
console.log("LOGO img:", /logo-white\.png/.test(r.html));
console.log("terms link:", /\/no\/terms/.test(r.html));
console.log("privacy link:", /\/no\/privacy/.test(r.html));
console.log("legal text:", /salgsvilkår/.test(r.html));
