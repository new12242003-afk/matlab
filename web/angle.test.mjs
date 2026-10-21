// ทดสอบแกนคำนวณ: node --test web/angle.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleFromPoints, arcSpan, testTriangle, renderTestTriangle } from './angle.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const rad = (d) => (d * Math.PI) / 180;

test('มุมที่รู้คำตอบ (เหมือนส่วนที่ 1 ของ demo_measure_angle.m)', () => {
  near(angleFromPoints([0, 0], [1, 0], [0, 1]), 90);
  near(angleFromPoints([0, 0], [1, 0], [1, 1]), 45);
  near(angleFromPoints([0, 0], [1, 0], [-1, 0]), 180);
  near(angleFromPoints([5, 5], [5, 0], [10, 5]), 90);
});

test('สลับแขนได้ผลเท่าเดิม และมุมเล็กมากยังแม่น', () => {
  near(angleFromPoints([0, 0], [3, 4], [-2, 7]), angleFromPoints([0, 0], [-2, 7], [3, 4]));
  near(angleFromPoints([0, 0], [1, 0], [1, 1e-9]), 1e-9 * (180 / Math.PI), 1e-15);
});

test('ส่วนโค้งกวาดทางที่สั้นกว่า', () => {
  const P1 = [Math.cos(rad(170)), Math.sin(rad(170))];
  const P2 = [Math.cos(rad(-170)), Math.sin(rad(-170))];
  near(arcSpan([0, 0], P1, P2).sweep, rad(20), 1e-12);
  near(arcSpan([0, 0], P2, P1).sweep, rad(-20), 1e-12);
});

test('สามเหลี่ยมทดสอบมีมุม 40°, 65°, 75°', () => {
  const { vertices: [A, B, C], trueAngles } = testTriangle();
  const measured = [angleFromPoints(A, B, C), angleFromPoints(B, C, A), angleFromPoints(C, A, B)];
  measured.forEach((m, i) => near(m, trueAngles[i]));
});

test('ภาพทดสอบ: เส้นเข้มบนพื้นสว่าง', () => {
  const { data, width, height, vertices } = renderTestTriangle();
  assert.equal(data.length, width * height * 4);
  const at = (X, Y) => data[((Math.round(Y) - 1) * width + (Math.round(X) - 1)) * 4];
  vertices.forEach(([X, Y]) => assert.ok(at(X, Y) < 80));
  assert.ok(at(10, 10) > 200);
});
