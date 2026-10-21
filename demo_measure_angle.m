%% Mini Project v2: วัดมุมจากรูป (ตัวอย่างสาธิต)
% สคริปต์นี้สร้างภาพสามเหลี่ยมที่รู้ค่ามุมจริง ให้ลองคลิกวัด แล้วเทียบความคลาดเคลื่อน
% ถ้าจะวัดจากรูปของตัวเอง ให้พิมพ์ใน Command Window:  measure_angle('ชื่อรูป.jpg')

clear; clc; close all;

%% 1) ทดสอบสูตรคำนวณมุมกับค่าที่รู้คำตอบ
fprintf('ทดสอบสูตร: มุมฉาก = %.1f°, 45° = %.1f°, เส้นตรง = %.1f°\n\n', ...
    angle_from_points([0 0], [1 0], [0 1]), ...
    angle_from_points([0 0], [1 0], [1 1]), ...
    angle_from_points([0 0], [1 0], [-1 0]));

%% 2) คลิกวัดมุมของสามเหลี่ยมจำลอง
[img, trueAngles] = make_angle_test_image();
names = {'A (ซ้ายล่าง)', 'B (ขวาล่าง)', 'C (บน)'};
disp('คลิกวัดมุมตามลำดับ A (ซ้ายล่าง) -> B (ขวาล่าง) -> C (บน)');
disp('แต่ละมุม: คลิกจุดยอดก่อน แล้วคลิกปลายแขนทั้งสองข้าง');
fprintf('\n');

angles = measure_angle(img, 3);

%% 3) เทียบกับค่าจริง
if numel(angles) == 3
    fprintf('\n%-14s %10s %10s %10s\n', 'มุม', 'วัดได้', 'ค่าจริง', 'คลาดเคลื่อน');
    for i = 1:3
        fprintf('%-14s %9.2f° %9.2f° %9.2f°\n', names{i}, angles(i), trueAngles(i), ...
            angles(i) - trueAngles(i));
    end
    fprintf('ผลรวมมุมที่วัดได้ = %.2f° (ทฤษฎี = 180°)\n', sum(angles));
end
