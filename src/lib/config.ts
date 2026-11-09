export const config = {
  demo: process.env.STEMI_DEMO !== "false",
  hospital: process.env.HOSPITAL_NAME || "โรงพยาบาลพลับพลาชัย จังหวัดบุรีรัมย์",
  hospitals: (
    process.env.REFER_HOSPITALS || "โรงพยาบาลบุรีรัมย์ (Cath lab)"
  ).split("|"),
  accessToken: process.env.STEMI_ACCESS_TOKEN || "",
  ekgCodes: (process.env.HOSXP_EKG_CODES || "3000123")
    .split(",")
    .filter(Boolean),
  lyticCodes: (process.env.HOSXP_LYTIC_CODES || "1000456")
    .split(",")
    .filter(Boolean),
  labItems: JSON.parse(
    process.env.HOSXP_LAB_ITEMS ||
      '{"Troponin":["1101"],"CK-MB":["1102"],"K":["201"],"Cr":["305"]}',
  ) as Record<string, string[]>,
  sheetUrl: process.env.GSHEET_URL || "",
  sheetToken: process.env.GSHEET_TOKEN || "",
  sendPii: process.env.GSHEET_SEND_PII === "true",
};
