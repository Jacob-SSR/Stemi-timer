# ผลตรวจรอบส่งมอบ

ตรวจด้วย Node.js 24.21.0 บน Windows · 9 พฤศจิกายน 2569

| การตรวจ | ผล |
|---|---|
| Next.js production build (`npm run build`) | ผ่าน |
| TypeScript strict (`npm run typecheck`) | ผ่าน |
| Core tests (`npm test`) | 8/8 ผ่าน |
| Edge browser workflow บน production build | 1/1 ผ่าน |
| สำรอง SQLite แบบ online และเปิดอ่าน snapshot | ผ่าน |
| หน้า desktop / mobile 390px และตรวจความกว้างเกินจอ | ผ่าน |

Core tests ครอบคลุม timezone ไทย, Needle ไม่ใช้เวลาสั่งยา, manual override/คืน HOSxP, validation, VN ซ้ำ, การบันทึกพร้อมกัน, ปิด/เปิดเคสด้วยข้อมูลเซิร์ฟเวอร์, RCA completion, transaction rollback, เคสค้างเกิน 24 ชั่วโมง, เวลาไม่ย้อนก่อน Door-in, CSV formula injection และ Office package จริง

Browser workflow ครอบคลุม API ปฏิเสธผู้ไม่ล็อกอิน, เข้าระบบ, เพิ่มเคส, แก้ชื่อ, กดเวลา, หมายเหตุ, ปิดเคส, ผลหลัง Refer, ดาวน์โหลด Word/Excel/PowerPoint/CSV, เปิด Dashboard, มือถือ และปฏิเสธ POST จาก Origin อื่น ไม่พบ page error ระหว่างทดสอบ

ใช้ข้อมูลสมมติทั้งหมด ยังไม่ได้ตรวจ HOSxP จริง, Google Apps Script deployment จริง, AI server จริง หรือรูปแบบเอกสารกับผู้ใช้งานโรงพยาบาล ต้องตรวจส่วนเหล่านี้ในสภาพแวดล้อมจริงก่อนใช้งาน
