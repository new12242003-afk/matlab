function angles = measure_angle(imageFile, nMax)
% MEASURE_ANGLE  วัดมุมจากรูปด้วยการคลิก 3 จุด
%   measure_angle                   เปิดหน้าต่างให้เลือกไฟล์รูป
%   measure_angle('photo.jpg')      วัดกี่มุมก็ได้ กด Enter เมื่อต้องการจบ
%   measure_angle('photo.jpg', 2)   วัด 2 มุมแล้วจบ
%   measure_angle(img)              ส่งภาพ (matrix) เข้ามาตรง ๆ ก็ได้
%
%   angles = measure_angle(...)     คืนค่ามุมทั้งหมดที่วัดได้ (องศา)
%
% วิธีคลิกแต่ละมุม: 1) จุดยอดมุม  2) ปลายแขนข้างที่ 1  3) ปลายแขนข้างที่ 2

if nargin < 2
    nMax = inf;
end
angles = [];

%% 1) อ่านภาพ
if nargin < 1 || isempty(imageFile)
    [f, p] = uigetfile({'*.jpg;*.jpeg;*.png;*.bmp', 'รูปภาพ'}, 'เลือกรูปที่จะวัดมุม');
    if isequal(f, 0)
        disp('ยกเลิกการเลือกไฟล์');
        return;
    end
    imageFile = fullfile(p, f);
end

if ischar(imageFile) || isstring(imageFile)
    img = imread(imageFile);
    figName = char(imageFile);
else
    img = imageFile;
    figName = 'ภาพที่ส่งเข้ามา';
end

%% 2) แสดงภาพ
figure('Name', ['Angle Meter - ' figName]);
if size(img, 3) == 3
    image(img);                           % ภาพสี
elseif isinteger(img)
    imagesc(img); colormap(gca, gray);    % ภาพขาวดำแบบจำนวนเต็ม
else
    imagesc(img, [0 1]); colormap(gca, gray);
end
axis image off; hold on;
ax = gca;

colors = lines(7);
fprintf('%5s %22s %22s %22s %10s\n', 'No.', 'Vertex (x,y)', 'Arm 1 (x,y)', 'Arm 2 (x,y)', 'Angle');

%% 3) วนรับการคลิกทีละมุม
k = 0;
while k < nMax
    col = colors(mod(k, 7) + 1, :);
    steps = {'จุดยอดมุม', 'ปลายแขนข้างที่ 1', 'ปลายแขนข้างที่ 2'};
    pts = zeros(3, 2);
    got = 0;
    for s = 1:3
        if ~isgraphics(ax)                % ผู้ใช้ปิดหน้าต่างรูปไปแล้ว
            break;
        end
        title(ax, sprintf('มุมที่ %d: คลิก%s   (กด Enter เพื่อจบ)', k + 1, steps{s}));
        try
            [x, y] = ginput(1);
        catch
            x = [];                       % ผู้ใช้ปิดหน้าต่างรูป
        end
        if isempty(x)
            break;
        end
        pts(s, :) = [x y];
        got = s;
        plot(x, y, 'o', 'Color', col, 'MarkerFaceColor', col, 'MarkerSize', 6);
    end
    if got < 3
        break;
    end

    V = pts(1, :);  P1 = pts(2, :);  P2 = pts(3, :);
    deg = angle_from_points(V, P1, P2);
    k = k + 1;
    angles(k) = deg; %#ok<AGROW>

    draw_angle(V, P1, P2, deg, col);
    fprintf('%5d %22s %22s %22s %9.2f°\n', k, fmt_point(V), fmt_point(P1), fmt_point(P2), deg);
end

%% 4) สรุปผล
if isgraphics(ax)
    title(ax, sprintf('วัดได้ %d มุม', k));
end
if k == 0
    disp('ยังไม่ได้วัดมุม');
end
end

function draw_angle(V, P1, P2, deg, col)
% วาดแขนทั้งสองข้าง ส่วนโค้งแสดงมุม และตัวเลของศา
plot([P1(1) V(1) P2(1)], [P1(2) V(2) P2(2)], '-', 'Color', col, 'LineWidth', 2);

a1 = atan2(P1(2) - V(2), P1(1) - V(1));
a2 = atan2(P2(2) - V(2), P2(1) - V(1));
sweep = mod(a2 - a1 + pi, 2*pi) - pi;     % กวาดทางที่สั้นกว่า (มุมไม่เกิน 180)
r = 0.3 * min(norm(P1 - V), norm(P2 - V));
th = a1 + linspace(0, sweep, 50);
plot(V(1) + r * cos(th), V(2) + r * sin(th), '-', 'Color', col, 'LineWidth', 1.5);

mid = a1 + sweep / 2;                     % วางตัวเลขตามแนวเส้นแบ่งครึ่งมุม
text(V(1) + 1.6 * r * cos(mid), V(2) + 1.6 * r * sin(mid), sprintf('%.1f°', deg), ...
    'Color', col, 'FontSize', 13, 'FontWeight', 'bold', ...
    'HorizontalAlignment', 'center', 'BackgroundColor', 'w', 'Margin', 1);
end

function s = fmt_point(P)
s = sprintf('(%.0f, %.0f)', P(1), P(2));
end
