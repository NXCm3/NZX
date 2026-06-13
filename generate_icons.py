from PIL import Image, ImageDraw, ImageFilter
import math
import os

def create_master_icon(size=512):
    """生成匹配用户图片风格的图标：深色背景 + 暖色调笑脸"""
    img = Image.new('RGB', (size, size), '#0a0a1a')
    draw = ImageDraw.Draw(img)

    # 背景径向渐变（中心略亮）
    for y in range(size):
        for x in range(size):
            dx = x - size / 2
            dy = y - size / 2
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < size * 0.5:
                brightness = int(max(0, 30 - dist / size * 30))
                img.putpixel((x, y), (brightness, brightness // 3, brightness // 4))

    # 中心区域 - 脸的外圈（红色光晕）
    face_radius = int(size * 0.38)
    cx, cy = size // 2, size // 2
    for y in range(cy - face_radius, cy + face_radius):
        for x in range(cx - face_radius, cx + face_radius):
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < face_radius:
                # 从中心黄色渐变到外圈红色
                t = dist / face_radius
                r = int(255)
                g = int(220 * (1 - t) + 40 * t)
                b = int(80 * (1 - t * t))
                # 边缘柔化
                edge = 1.0
                if dist > face_radius - 8:
                    edge = max(0, (face_radius - dist) / 8.0)
                # 与背景混合
                bg = img.getpixel((x, y))
                mix_r = int(r * edge + bg[0] * (1 - edge))
                mix_g = int(g * edge + bg[1] * (1 - edge))
                mix_b = int(b * edge + bg[2] * (1 - edge))
                img.putpixel((x, y), (mix_r, mix_g, mix_b))

    # 眼睛（两个黑色椭圆）
    eye_w = int(size * 0.07)
    eye_h = int(size * 0.11)
    eye_y = int(size * 0.42)
    eye_lx = int(size * 0.38)
    eye_rx = int(size * 0.62)

    # 左眼
    bbox_l = (eye_lx - eye_w // 2, eye_y - eye_h // 2, eye_lx + eye_w // 2, eye_y + eye_h // 2)
    draw.ellipse(bbox_l, fill=(20, 10, 15))
    # 右眼
    bbox_r = (eye_rx - eye_w // 2, eye_y - eye_h // 2, eye_rx + eye_w // 2, eye_y + eye_h // 2)
    draw.ellipse(bbox_r, fill=(20, 10, 15))

    # 大嘴巴（张开大笑的嘴，黑色椭圆 + 内部更暗）
    mouth_w = int(size * 0.22)
    mouth_h = int(size * 0.18)
    mouth_cx = size // 2
    mouth_cy = int(size * 0.60)
    bbox_mouth = (mouth_cx - mouth_w // 2, mouth_cy - mouth_h // 2,
                   mouth_cx + mouth_w // 2, mouth_cy + mouth_h // 2)
    draw.ellipse(bbox_mouth, fill=(30, 0, 10))

    # 嘴巴内部稍亮的红色（上唇）
    inner_w = int(size * 0.16)
    inner_h = int(size * 0.06)
    inner_cy = mouth_cy - int(mouth_h * 0.15)
    bbox_inner = (mouth_cx - inner_w // 2, inner_cy - inner_h // 2,
                  mouth_cx + inner_w // 2, inner_cy + inner_h // 2)
    draw.ellipse(bbox_inner, fill=(180, 20, 40))

    # 轻微柔化
    img = img.filter(ImageFilter.SMOOTH)
    return img


def save_icons(master, base_dir):
    densities = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }
    for folder, size in densities.items():
        folder_path = os.path.join(base_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        resized = master.resize((size, size), Image.LANCZOS)
        # 普通图标（带轻微圆角以更好看）
        rounded = round_corners(resized, int(size * 0.12))
        rounded.save(os.path.join(folder_path, 'ic_launcher.png'), 'PNG')
        # 圆形图标
        round_img = make_circle(resized)
        round_img.save(os.path.join(folder_path, 'ic_launcher_round.png'), 'PNG')
        # 前景（自适应图标用）- 使用原始方形
        resized.save(os.path.join(folder_path, 'ic_launcher_foreground.png'), 'PNG')
        print(f'已生成 {folder}: {size}x{size}')


def round_corners(img, radius):
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), img.size], radius=radius, fill=255)
    result = Image.new('RGB', img.size, (0, 0, 0))
    result.paste(img, mask=mask)
    return result


def make_circle(img):
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([(0, 0), img.size], fill=255)
    result = Image.new('RGB', img.size, (0, 0, 0))
    result.paste(img, mask=mask)
    return result


if __name__ == '__main__':
    base_dir = r'C:\Users\nxc34\Desktop\IA\android\app\src\main\res'
    master = create_master_icon(512)
    # 同时存一个大版本方便查看
    master.save(os.path.join(base_dir, '..', 'icon_master.png'), 'PNG')
    save_icons(master, base_dir)
    print('所有图标生成完成')
