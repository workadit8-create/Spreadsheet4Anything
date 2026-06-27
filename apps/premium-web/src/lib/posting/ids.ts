import { wibTodayIso } from "@/lib/date/wib";

function wibStamp(now = new Date()) {
  const [y, m, day] = wibTodayIso(now).split("-");
  return { y, m, day };
}

export function generateOrderNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `PW-${y}${m}${day}-${seq}`;
}

export function generateTransactionId(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `TX-PW-${y}${m}${day}-${seq}`;
}

export function generatePiutangTransactionId(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `TX-PI-PW-${y}${m}${day}-${seq}`;
}

export function generatePoNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `PO-PW-${y}${m}${day}-${seq}`;
}

export function generateUtangTransactionId(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `TX-UT-PW-${y}${m}${day}-${seq}`;
}

export function generateMutasiTransferNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `MB-PW-${y}${m}${day}-${seq}`;
}

export function generateMutasiTransactionId(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `TX-MB-PW-${y}${m}${day}-${seq}`;
}

export function generateManualDocNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `JM-PW-${y}${m}${day}-${seq}`;
}

export function generateManualTransactionId(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `TX-JM-PW-${y}${m}${day}-${seq}`;
}

export function generateCicilanBankDocNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `CB-PW-${y}${m}${day}-${seq}`;
}

export function generateQuotationNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `QT-PW-${y}${m}${day}-${seq}`;
}

export function generatePrNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `PR-PW-${y}${m}${day}-${seq}`;
}

export function generateConsignmentReceiptNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `TT-PW-${y}${m}${day}-${seq}`;
}

export function generateConsignmentSettlementNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `ST-PW-${y}${m}${day}-${seq}`;
}

export function generateConsignmentReturnNo(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `RT-PW-${y}${m}${day}-${seq}`;
}

export function generateCicilanBankTransactionId(): string {
  const { y, m, day } = wibStamp();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `TX-CB-PW-${y}${m}${day}-${seq}`;
}
