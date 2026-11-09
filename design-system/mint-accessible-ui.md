# STEMI · Mint interface

Design direction for the Thai ER interface: calm mint surfaces, dark forest text, clear labels and modestly larger type for older staff.

## Decisions

- Body and form controls: 16px. Main workflow labels: 15–16px. Supporting text: 13–14px. Section titles: 17–20px. Page title: 26–30px. Large numbers are reserved for timers.
- Primary mint fill `#C9F2DE` with dark `#174C37` text. White cards on `#F3F8F5`. Red retains its meaning for overdue steps, with explanatory text as well.
- Navigation uses Thai labels: ติดตามผู้ป่วย, สรุปผลการดูแล, เคสที่ปิดแล้ว. Mobile retains visible labels.
- “บันทึกตอนนี้” records actual care time. A completed step says “บันทึกแล้ว”; editing is a separate labeled action to avoid accidentally replacing a completed time with the current time.
- Date/time editing uses a native picker instead of requiring an ISO timestamp in a browser prompt. Save, cancel and revert actions are separate.
- Closing a case uses a patient-specific confirmation that explains where the case goes. RCA follows the existing workflow.
- Native dialogs contain keyboard focus, close with Escape, make the background inert, and restore focus to the opener. Reduced motion is supported.
- HOSxP adapter, data model, targets and clinical calculations remain unchanged.

## Skill use

Applied [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), specifically its verified readable-font-size and color-contrast recommendations plus keyboard, touch-target and responsive guidelines. Its design-system search returned marketing-page layouts on both attempts; those layouts were not applied to this clinical application. The mint palette follows the user's explicit preference.

The interface uses local system Thai fonts and does not depend on downloading web fonts at runtime.
