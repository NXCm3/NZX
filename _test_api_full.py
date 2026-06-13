import urllib.request, json, urllib.error

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36'
headers = {'Content-Type': 'application/json', 'User-Agent': ua, 'Accept': 'application/json'}
url = 'https://nzx-5o4.pages.dev/api/app-updates/admin-auth'

# 测试1: 密码错误
req1 = urllib.request.Request(url, data=json.dumps({'password': 'wrong', 'deviceId': 'test-device-001'}).encode(), headers=headers, method='POST')
try:
    r = urllib.request.urlopen(req1, timeout=15)
    print('1. 密码错误:', r.status, r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('1. 密码错误: HTTP', e.code, e.read().decode('utf-8'))

# 测试2: 首次部署 + 正确密码 + isFirst=1
req2 = urllib.request.Request(url, data=json.dumps({'password': 'updateAdmin888', 'deviceId': 'pc-cd2679499f227bb434ce6d71', 'deviceName': 'PC-更新发布工具', 'isFirst': '1'}).encode(), headers=headers, method='POST')
try:
    r = urllib.request.urlopen(req2, timeout=15)
    print('2. 首次授权:', r.status, r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('2. 首次授权: HTTP', e.code, e.read().decode('utf-8'))

# 测试3: 正常登录（已授权设备）
req3 = urllib.request.Request(url, data=json.dumps({'password': 'updateAdmin888', 'deviceId': 'pc-cd2679499f227bb434ce6d71'}).encode(), headers=headers, method='POST')
try:
    r = urllib.request.urlopen(req3, timeout=15)
    print('3. 正常登录:', r.status, r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('3. 正常登录: HTTP', e.code, e.read().decode('utf-8'))

# 测试4: 发布新版本
pub_url = 'https://nzx-5o4.pages.dev/api/app-updates/publish'
req4 = urllib.request.Request(pub_url, data=json.dumps({
    'password': 'updateAdmin888',
    'deviceId': 'pc-cd2679499f227bb434ce6d71',
    'version': '1.0.1',
    'downloadUrl': 'https://example.com/app-release.apk',
    'releaseNotes': '测试版本发布',
    'isForce': False,
    'fileSize': 102400,
    'platform': 'android'
}).encode(), headers=headers, method='POST')
try:
    r = urllib.request.urlopen(req4, timeout=15)
    print('4. 发布版本:', r.status, r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('4. 发布版本: HTTP', e.code, e.read().decode('utf-8'))

# 测试5: 客户端检测更新
check_url = 'https://nzx-5o4.pages.dev/api/app-updates/check'
req5 = urllib.request.Request(check_url, data=json.dumps({'currentVersion': '1.0.0', 'platform': 'android'}).encode(), headers=headers, method='POST')
try:
    r = urllib.request.urlopen(req5, timeout=15)
    print('5. 检测更新:', r.status, r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('5. 检测更新: HTTP', e.code, e.read().decode('utf-8'))

# 测试6: 版本列表
list_url = 'https://nzx-5o4.pages.dev/api/app-updates/list'
req6 = urllib.request.Request(list_url, data=json.dumps({'password': 'updateAdmin888', 'deviceId': 'pc-cd2679499f227bb434ce6d71', 'platform': 'android'}).encode(), headers=headers, method='POST')
try:
    r = urllib.request.urlopen(req6, timeout=15)
    print('6. 版本列表:', r.status, r.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('6. 版本列表: HTTP', e.code, e.read().decode('utf-8'))
