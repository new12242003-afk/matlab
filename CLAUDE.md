# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ภาพรวม

Mini project MATLAB สำหรับวัดมุมจากรูป: ผู้ใช้คลิก 3 จุดต่อ 1 มุม (จุดยอด → ปลายแขน 1 → ปลายแขน 2) แล้วโปรแกรมคำนวณมุมเป็นองศา วาดเส้น/ส่วนโค้งกำกับ และพิมพ์ตารางผลใน Command Window

ข้อจำกัดสำคัญ: **ใช้แค่ MATLAB พื้นฐาน ห้ามพึ่ง Toolbox** (เช่น Image Processing Toolbox) และต้องรันบน MATLAB Online ได้ ฟังก์ชันอย่าง `hough`, `imshow`, `insertShape` จึงไม่ควรใช้ — ใช้ `image`/`imagesc`, `plot`, `text`, `ginput` แทน

## การรัน

เครื่องนี้ไม่ได้ติดตั้ง MATLAB/Octave ไว้ (ไม่มี `matlab` ใน PATH) จึงรันหรือทดสอบโค้ดจาก shell ไม่ได้ ผู้ใช้รันเองใน MATLAB / MATLAB Online:

```matlab
measure_angle('photo.jpg')      % วัดกี่มุมก็ได้ กด Enter เพื่อจบ
measure_angle('photo.jpg', 2)   % วัด 2 มุมแล้วจบ
measure_angle                   % เปิดหน้าต่างเลือกไฟล์
measure_angle(img)              % ส่ง matrix ภาพเข้ามาตรง ๆ
demo_measure_angle              % สาธิต + เทียบกับมุมจริง (40°, 65°, 75°)
```

ไม่มี test framework — การตรวจสอบมีสองส่วนใน `demo_measure_angle.m`: ส่วนที่ 1 เช็กสูตร `angle_from_points` กับคำตอบที่รู้ (90°, 45°, 180°) แบบไม่ต้องคลิก ส่วนที่ 2–3 ต้องคลิกเองบนภาพสามเหลี่ยมจำลองแล้วดูความคลาดเคลื่อน

## สถาปัตยกรรม

- `measure_angle.m` — entry point หลัก รับได้ทั้ง path ไฟล์ (char/string) หรือ matrix ภาพ เลือกวิธีแสดงตามชนิดภาพ (RGB → `image`, grayscale integer → `imagesc` + gray, grayscale double → `imagesc(img,[0 1])`) แล้ววนรับ `ginput(1)` ทีละจุด การจบลูปเกิดได้ 3 แบบ: ครบ `nMax`, ผู้ใช้กด Enter (`ginput` คืนค่าว่าง), หรือปิดหน้าต่าง (ตรวจด้วย `isgraphics(ax)` และ `try/catch` รอบ `ginput`) มุมที่คลิกไม่ครบ 3 จุดจะถูกทิ้ง มี local functions `draw_angle` (วาดส่วนโค้งทางที่สั้นกว่าด้วย `mod(a2-a1+pi,2*pi)-pi`) และ `fmt_point`
- `angle_from_points.m` — แกนคำนวณ: `atan2d(|u×v|, u·v)` ให้ผล 0..180° เสมอ ตั้งใจใช้ `atan2` แทน `acos` เพื่อความแม่นยำใกล้ 0°/180° — อย่าเปลี่ยนกลับเป็น `acos`
- `make_angle_test_image.m` — สร้างภาพ 640×480 double (0..1) สามเหลี่ยม A,B,C ที่มุม [40 65 75] หาตำแหน่ง C ด้วยกฎของไซน์ วาดเส้นแบบ vectorized ด้วยระยะจากพิกเซลถึง segment และใส่ noise ด้วย `rng(3)` (ผลซ้ำได้)
- `demo_measure_angle.m` — script (ไม่ใช่ function, เรียก `clear; clc; close all`) เชื่อมทุกส่วนเข้าด้วยกัน

พิกัดใช้ระบบภาพ: แกน y ชี้ลง (จึงใช้ `-sind` ตอนวาง C) จุดเป็น row vector `[x y]`

## เวอร์ชันเว็บ (`web/`)

เว็บไซต์ static (HTML/CSS/JS ล้วน ไม่มี build step ไม่มี framework) deploy จาก GitHub ได้ทั้งสองที่ โดยต้องชี้ไปที่ `web/` เพราะรากโปรเจกต์ไม่มี `index.html`: Railway ใช้ `Staticfile` (`root: web`, Railpack + Caddy) ส่วน Vercel ใช้ `vercel.json` (`outputDirectory: "web"`) ข้อจำกัดเรื่อง Toolbox ใช้กับฝั่ง MATLAB เท่านั้น

Caddy ของ Railpack ใส่ CSP ที่ `img-src` ไม่อนุญาต `blob:` จึงต้องโหลดรูปที่ผู้ใช้เลือกเป็น `data:` URL (`readAsDataUrl` ใน `app.js`) ห้ามเปลี่ยนกลับไปใช้ `URL.createObjectURL` กับ `<img>` (ใช้ blob กับลิงก์ดาวน์โหลดได้ เพราะ CSP ไม่บล็อกการดาวน์โหลด)

- `web/angle.js` — พอร์ตของ `angle_from_points.m` (`angleFromPoints`), การกวาดส่วนโค้งของ `draw_angle` (`arcSpan`) และ `make_angle_test_image.m` (`testTriangle`/`renderTestTriangle`) ไม่แตะ DOM จึงทดสอบด้วย `node --test web/angle.test.mjs` ได้ (node มีในเครื่อง) ถ้าแก้สูตรฝั่ง `.m` ให้แก้ที่นี่ด้วย
- `web/app.js` — UI ทั้งหมด เก็บจุดเป็นพิกัด canvas (ขอบพิกเซล = 0) แต่แสดง/ส่งออกเป็นพิกัดแบบ MATLAB (`toMatlab` บวก 0.5) จุดที่คลิกซ้ำบนจุดเดิมจะถูก snap ให้พิกัดเท่ากันพอดี และ `refsAt` ใช้ความเท่ากันนี้ลากจุดร่วมไปด้วยกัน
- ข้อความที่ผู้ใช้เห็นในเว็บเป็นภาษาไทยเหมือนฝั่ง MATLAB

## ข้อตกลงของโค้ด

- คอมเมนต์ ข้อความ `title`/`disp`/`fprintf` ที่ผู้ใช้เห็น และ README เขียนเป็นภาษาไทย; ชื่อตัวแปร/ฟังก์ชันเป็นภาษาอังกฤษแบบ camelCase/snake_case ตามไฟล์เดิม
- ทุก function มี help block (บรรทัด `% NAME  คำอธิบาย` + รูปแบบการเรียก) ไว้ใต้ `function` และแบ่งส่วนด้วย `%%`
- ใช้ฟังก์ชันองศา (`sind`, `cosd`, `atan2d`) เมื่อทำงานกับองศา
- ถ้าเพิ่ม/เปลี่ยนวิธีเรียกใช้ ให้อัปเดตตารางไฟล์และส่วน "วิธีใช้" ใน `README.md` ด้วย
