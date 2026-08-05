import urllib.request

urls = [
    'https://image.pollinations.ai/prompt/jeans?width=512&height=512&seed=1&model=turbo&nologo=true&enhance=false&referrer=estelite',
    'https://image.pollinations.ai/prompt/jeans?width=512&height=512&seed=1&model=flux&nologo=true&enhance=true',
    'https://image.pollinations.ai/prompt/fashion%20product?width=512&height=512&seed=1&model=turbo&nologo=true&enhance=false&referrer=estelite',
    'https://image.pollinations.ai/prompt/fashion%20product?width=512&height=512&seed=1&model=flux&nologo=true&enhance=true',
]

for url in urls:
    print('URL:', url)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*'})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
            print('status', resp.status)
            print('content-type', resp.headers.get('content-type'))
            print('content-length', resp.headers.get('content-length'))
            print('bytes read', len(data))
            print('prefix', data[:8])
    except Exception as e:
        print('error', repr(e))
    print()
