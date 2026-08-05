import urllib.request

prompt = 'fashion product jaqueta jeans, isolated product shot, white background, no person, centered garment, sharp details, high quality, photorealistic, clean commercial style, soft studio lighting'
encoded = urllib.request.quote(prompt, safe='')

urls = [
    f'https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&seed=42&model=turbo&nologo=true&enhance=false&referrer=estelite',
    f'https://image.pollinations.ai/prompt/{encoded}?width=800&height=800&seed=42&model=turbo&nologo=true&enhance=false&referrer=estelite',
    f'https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&seed=42&model=flux&nologo=true&enhance=true',
    f'https://image.pollinations.ai/prompt/{encoded}?width=800&height=800&seed=42&model=flux&nologo=true&enhance=true',
]

for url in urls:
    print('URL:', url)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            print('status', resp.status)
            print('content-type', resp.headers.get('content-type'))
            print('content-length', resp.headers.get('content-length'))
            print('bytes read', len(data))
            print('prefix', data[:8])
    except Exception as e:
        print('error', repr(e))
    print()
