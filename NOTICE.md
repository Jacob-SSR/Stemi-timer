เครื่องมือ EKG (`public/tools/ekg.html`), PDF.js (`pdf.min.js`, `pdf.worker.min.js`) และ Google Apps Script (`integrations/Code.gs`) มาจาก `stemi-timer.zip` ที่ผู้ใช้ให้มา เก็บข้อความลิขสิทธิ์ในไฟล์ vendor ไว้เดิม

หน้าแอปหลักและ API ถูกพัฒนาใหม่ด้วย Next.js / TypeScript โดยอิง workflow และค่าตั้งต้นจากชุดดังกล่าว ไม่ได้รวม PHP runtime หรือ PHP endpoints

ไลบรารี npm ใช้ตามใบอนุญาตที่อยู่ในแต่ละ package และบันทึกเวอร์ชันไว้ใน package-lock.json
