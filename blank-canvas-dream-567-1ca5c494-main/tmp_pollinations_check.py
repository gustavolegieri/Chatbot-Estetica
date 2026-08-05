import urllib.request

url = 'https://image.pollinations.ai/prompt/fashion%20product%20jaqueta%20jeans%2C%20isolated%20product%20shot%2C%20white%20background%2C%20no%20person%2C%20centered%20garment%2C%20sharp%20details%2C%20high%20quality%2C%20photorealistic%2C%20clean%20commercial%20style%2C%20soft%20studio%20lighting?width=800&height=800&seed=42&model=turbo&nologo=true&enhance=false&referrer=estelite'
req = urllib.request.Request(url, method='GET', headers={'User-Agent': 'python-urllib/3'})
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        print('status', resp.status)
        print('content-type', resp.headers.get('content-type'))
        print('content-length', resp.headers.get('content-length'))
        data = resp.read(64)
        print('body-prefix', data[:64])
except Exception as e:
    print('error', repr(e))
