// angle.js — แกนคำนวณของเว็บวัดมุม (พอร์ตจาก angle_from_points.m และ make_angle_test_image.m)
// จุดเป็น [x, y] ในระบบพิกัดภาพ (แกน y ชี้ลง)

const DEG = 180 / Math.PI;
const sind = (d) => Math.sin(d / DEG);
const cosd = (d) => Math.cos(d / DEG);

// มุมที่จุดยอด V ระหว่างแขน V->P1 และ V->P2 (องศา 0..180)
// theta = atan2(|u x v|, u . v) ใช้ atan2 แทน acos เพราะแม่นยำกว่าเมื่อมุมใกล้ 0 หรือ 180 องศา
export function angleFromPoints(V, P1, P2) {
  const ux = P1[0] - V[0], uy = P1[1] - V[1];
  const vx = P2[0] - V[0], vy = P2[1] - V[1];
  const cross = ux * vy - uy * vx;
  const dot = ux * vx + uy * vy;
  return Math.atan2(Math.abs(cross), dot) * DEG;
}

// มุมเริ่มต้นและระยะกวาด (เรเดียน) ของส่วนโค้งทางที่สั้นกว่า เหมือน draw_angle ใน measure_angle.m
export function arcSpan(V, P1, P2) {
  const a1 = Math.atan2(P1[1] - V[1], P1[0] - V[0]);
  const a2 = Math.atan2(P2[1] - V[1], P2[0] - V[0]);
  const sweep = mod(a2 - a1 + Math.PI, 2 * Math.PI) - Math.PI;
  return { start: a1, sweep };
}

function mod(a, m) {
  return ((a % m) + m) % m;
}

// สามเหลี่ยม A, B, C ที่มุม [40 65 75] แบบเดียวกับ make_angle_test_image.m
// พิกัดแบบ MATLAB: ศูนย์กลางพิกเซลแรกคือ (1, 1)
export function testTriangle() {
  const angA = 40, angB = 65;
  const angC = 180 - angA - angB;
  const A = [100, 400];
  const B = [540, 400];
  const AB = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const AC = AB * sind(angB) / sind(angC);                // กฎของไซน์
  const C = [A[0] + AC * cosd(angA), A[1] - AC * sind(angA)];  // แกน y ชี้ลง จึงใช้ -sin
  return { width: 640, height: 480, vertices: [A, B, C], trueAngles: [angA, angB, angC] };
}

// วาดภาพสามเหลี่ยมทดสอบเป็นพิกเซล RGBA (ขาวดำ เส้นเข้มบนพื้นสว่าง มี noise)
export function renderTestTriangle() {
  const t = testTriangle();
  const { width: W, height: H } = t;
  const [A, B, C] = t.vertices;
  const gray = new Float32Array(W * H).fill(0.92);       // พื้นหลังสีขาวอมเทา

  // หาระยะจากทุกพิกเซลไปยังเส้นตรงแต่ละเส้น
  for (const [P, Q] of [[A, B], [B, C], [C, A]]) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1];
    const dd = dx * dx + dy * dy;
    for (let row = 0; row < H; row++) {
      const Y = row + 1;
      for (let col = 0; col < W; col++) {
        const X = col + 1;
        const s = Math.min(Math.max(((X - P[0]) * dx + (Y - P[1]) * dy) / dd, 0), 1);
        if (Math.hypot(X - P[0] - s * dx, Y - P[1] - s * dy) <= 2) {
          gray[row * W + col] = 0.15;                    // เส้นหนาประมาณ 4 พิกเซล
        }
      }
    }
  }

  const randn = gaussian(3);                             // seed คงที่ ได้ภาพเดิมทุกครั้ง
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const g = Math.min(Math.max(gray[i] + 0.02 * randn(), 0), 1) * 255;
    data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = g;
    data[4 * i + 3] = 255;
  }
  return { ...t, data };
}

// ตัวสุ่มแจกแจงปกติแบบกำหนด seed ได้ (mulberry32 + Box-Muller)
function gaussian(seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
