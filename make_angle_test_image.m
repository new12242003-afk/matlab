function [img, trueAngles, vertices] = make_angle_test_image()
% MAKE_ANGLE_TEST_IMAGE  สร้างภาพสามเหลี่ยมที่รู้ค่ามุมจริง ไว้ทดสอบโปรแกรมวัดมุม
%   [img, trueAngles, vertices] = make_angle_test_image()
%   img        : ภาพขาวดำ (double ค่า 0..1) เส้นสีเข้มบนพื้นสว่าง
%   trueAngles : มุมจริงที่จุด A, B, C (องศา) = [40 65 75]
%   vertices   : พิกัด [x y] ของ A (ซ้ายล่าง), B (ขวาล่าง), C (บน)

H = 480;  W = 640;
angA = 40;  angB = 65;
angC = 180 - angA - angB;
trueAngles = [angA angB angC];

% วาง A และ B บนเส้นแนวนอน แล้วหา C ด้วยกฎของไซน์
A  = [100 400];
B  = [540 400];
AB = norm(B - A);
AC = AB * sind(angB) / sind(angC);
C  = A + AC * [cosd(angA), -sind(angA)];  % แกน y ของภาพชี้ลง จึงใช้ -sin
vertices = [A; B; C];

% วาดเส้นด้วยการหาระยะจากทุกพิกเซลไปยังเส้นตรงแต่ละเส้น
[X, Y] = meshgrid(1:W, 1:H);
img = 0.92 * ones(H, W);                  % พื้นหลังสีขาวอมเทา
edges = {A, B; B, C; C, A};
for e = 1:3
    P = edges{e, 1};  Q = edges{e, 2};
    d = Q - P;
    s = ((X - P(1)) * d(1) + (Y - P(2)) * d(2)) / (d * d');  % ตำแหน่งบนเส้น (0..1)
    s = min(max(s, 0), 1);
    dist = sqrt((X - P(1) - s * d(1)).^2 + (Y - P(2) - s * d(2)).^2);
    img(dist <= 2) = 0.15;                % เส้นหนาประมาณ 4 พิกเซล
end

rng(3);
img = min(max(img + 0.02 * randn(H, W), 0), 1);
end
