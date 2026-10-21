function deg = angle_from_points(V, P1, P2)
% ANGLE_FROM_POINTS  หามุมที่จุดยอด V ระหว่างแขน V->P1 และ V->P2 (หน่วยองศา 0..180)
%   deg = angle_from_points(V, P1, P2)
%   V, P1, P2 : จุด [x y]
%
% ตัวอย่าง: angle_from_points([0 0], [1 0], [0 1])  ->  90
%
% หลักการ: สร้างเวกเตอร์ u = P1 - V และ v = P2 - V
%   ผลคูณจุด   u . v       = |u||v| cos(theta)
%   ผลคูณไขว้  |u x v|     = |u||v| sin(theta)
%   theta = atan2(|u x v|, u . v)
% ใช้ atan2 แทน acos เพราะแม่นยำกว่าเมื่อมุมใกล้ 0 หรือ 180 องศา

u = P1 - V;
v = P2 - V;
crossUV = u(1) * v(2) - u(2) * v(1);
dotUV   = u(1) * v(1) + u(2) * v(2);
deg = atan2d(abs(crossUV), dotUV);
end
