/**
 * STEMI Fast Track → Google Sheet
 * รับข้อมูลเคสที่ปิดแล้วจากเซิร์ฟเวอร์ รพ. แล้วเขียนลงชีต (ส่งซ้ำ = อัปเดตแถวเดิม ไม่ซ้ำ)
 *
 * วิธีติดตั้ง
 * 1. สร้าง Google Sheet ใหม่ > ส่วนขยาย > Apps Script > วางโค้ดนี้แทนของเดิม
 * 2. แก้ TOKEN ให้ตรงกับ 'token' ใน config.php
 * 3. ทำให้ใช้งานได้ (Deploy) > การทำให้ใช้งานได้รายการใหม่ > ประเภท: เว็บแอป
 *    - ดำเนินการในฐานะ: ฉัน
 *    - ผู้ที่มีสิทธิ์เข้าถึง: ทุกคน
 * 4. คัดลอก URL เว็บแอป (ลงท้าย /exec) ไปใส่ 'url' ใน config.php
 */
const TOKEN = 'เปลี่ยนเป็นรหัสลับเดียวกับ config.php';
const SHEET_NAME = 'STEMI_FastTrack';

const HEAD = ['case_id', 'วันที่', 'HN', 'VN', 'ผู้ป่วย', 'สิทธิการรักษา', 'ที่อยู่', 'ประวัติปัจจุบัน', 'โรคประจำตัว', 'แนวทาง',
  'Door-in', 'EKG', 'แพทย์วินิจฉัย', 'Needle', 'Door-out', 'ส่งต่อ',
  'D2EKG (นาที)', 'D2N (นาที)', 'DIDO (นาที)', 'Door→ผล Lab (นาที)', 'ผล Lab',
  'D2EKG ผ่านเป้า', 'D2N ผ่านเป้า', 'DIDO ผ่านเป้า', 'อาการเปลี่ยนแปลง / หมายเหตุ', 'ส่งเข้าชีตเมื่อ',
  'RCA สถานะ', 'ระดับความรุนแรง', 'ปัจจัยที่เกี่ยวข้อง', 'สาเหตุราก', 'มาตรการแก้ไข',
  'วินิจฉัยสุดท้าย (ปลายทาง)', 'การรักษาที่ปลายทาง', 'ผลการรักษา', 'รายละเอียดผลหลังส่งต่อ'];
const TIME_COLS = ['Door-in', 'EKG', 'แพทย์วินิจฉัย', 'Needle', 'Door-out'];

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }); }
  if (d.token !== TOKEN) return out({ ok: false, error: 'token ไม่ถูกต้อง' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet();
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#f2e4e4');   // เพิ่มหัวคอลัมน์ใหม่ (RCA) ให้ชีตเดิม
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0])) : [];
    const done = [];
    (d.rows || []).forEach(r => {
      r['ส่งเข้าชีตเมื่อ'] = new Date();
      const vals = HEAD.map(h => {
        let v = r[h];
        if (v === null || v === undefined) return '';
        if (TIME_COLS.indexOf(h) >= 0 && v) return new Date(String(v).replace(' ', 'T') + '+07:00');
        return v;
      });
      const i = ids.indexOf(String(r.case_id));
      if (i >= 0) sh.getRange(i + 2, 1, 1, vals.length).setValues([vals]);
      else { sh.appendRow(vals); ids.push(String(r.case_id)); }
      done.push(r.case_id);
    });
    return out({ ok: true, saved: done });
  } finally {
    lock.releaseLock();
  }
}

// ทดสอบว่าเว็บแอปทำงาน (เปิด URL ในเบราว์เซอร์)
function doGet() { return out({ ok: true, msg: 'STEMI Fast Track sheet พร้อมรับข้อมูล' }); }

function getSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#f2e4e4').setWrap(true);
    sh.setFrozenRows(1);
    sh.hideColumns(1);   // case_id ใช้กันข้อมูลซ้ำ
    TIME_COLS.forEach(h => sh.getRange(2, HEAD.indexOf(h) + 1, 2000, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss'));
    sh.getRange(2, HEAD.indexOf('ส่งเข้าชีตเมื่อ') + 1, 2000, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    sh.setColumnWidth(HEAD.indexOf('อาการเปลี่ยนแปลง / หมายเหตุ') + 1, 420);
  }
  return sh;
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
