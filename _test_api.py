import urllib.request, json, urllib.error

ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
headers = {'User-Agent': ua, 'Accept': 'application/json'}

for p in ['/api', '/api/', '/api/videos', '/api/app-updates/check']:
    url = 'https://nzx-5o4.pages.dev' + p
    try:
        req = urllib.request.Request(url,
            data=json.dumps({"currentVersion": "1.0.0", "platform": "android"}).encode('utf-8'),
            headers=headers, method='POST')
        r = urllib.request.urlopen(req, timeout=15)
        body = r.read().decode('utf-8')
        print(p, '->', r.status, body[:400])
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode('utf-8')
        except Exception:
            body = ''
        print(p, '-> HTTP', e.code, body[:400])
    except Exception as e:
        print(p, '-> ERR:', e)
