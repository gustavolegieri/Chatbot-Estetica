import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SEO_KEYS = [
  'seo_title','seo_description','seo_keywords','seo_canonical','seo_og_image',
  'seo_author','seo_robots','seo_ga_id','seo_gtm_id','seo_meta_pixel_id',
  'seo_google_site_verification','seo_custom_head_code','seo_custom_body_code'
];

const MARK = 'data-seo-injected';

function clean(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') return val.replace(/^"|"$/g, '');
  return String(val);
}

function setMeta(name: string, content: string, attr: 'name'|'property' = 'name') {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    el.setAttribute(MARK, '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  if (!href) return;
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute(MARK, '1');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function injectRaw(html: string, target: HTMLElement, tag: string) {
  // Remove previous injected nodes
  target.querySelectorAll(`[${tag}]`).forEach(n => n.remove());
  if (!html.trim()) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('script,noscript,style,meta,link').forEach((node) => {
    const fresh = document.createElement(node.tagName.toLowerCase());
    for (const attr of Array.from(node.attributes)) fresh.setAttribute(attr.name, attr.value);
    fresh.textContent = node.textContent;
    fresh.setAttribute(tag, '1');
    target.appendChild(fresh);
  });
}

export function SEOInjector() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('key,value')
        .in('key', SEO_KEYS);
      if (cancelled || !data) return;
      const s: Record<string, string> = {};
      data.forEach(r => { s[r.key] = clean(r.value); });

      if (s.seo_title) document.title = s.seo_title;
      setMeta('description', s.seo_description);
      setMeta('keywords', s.seo_keywords);
      setMeta('author', s.seo_author);
      setMeta('robots', s.seo_robots);
      if (s.seo_canonical) setLink('canonical', s.seo_canonical);

      setMeta('og:title', s.seo_title, 'property');
      setMeta('og:description', s.seo_description, 'property');
      setMeta('og:url', s.seo_canonical, 'property');
      if (s.seo_og_image) setMeta('og:image', s.seo_og_image, 'property');
      setMeta('twitter:title', s.seo_title);
      setMeta('twitter:description', s.seo_description);
      if (s.seo_og_image) setMeta('twitter:image', s.seo_og_image);

      if (s.seo_google_site_verification) {
        setMeta('google-site-verification', s.seo_google_site_verification);
      }

      // Tracking
      if (s.seo_ga_id && !document.getElementById('ga-tag')) {
        const s1 = document.createElement('script');
        s1.id = 'ga-tag';
        s1.async = true;
        s1.src = `https://www.googletagmanager.com/gtag/js?id=${s.seo_ga_id}`;
        s1.setAttribute(MARK, '1');
        document.head.appendChild(s1);
        const s2 = document.createElement('script');
        s2.setAttribute(MARK, '1');
        s2.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${s.seo_ga_id}');`;
        document.head.appendChild(s2);
      }
      if (s.seo_gtm_id && !document.getElementById('gtm-tag')) {
        const sc = document.createElement('script');
        sc.id = 'gtm-tag';
        sc.setAttribute(MARK, '1');
        sc.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${s.seo_gtm_id}');`;
        document.head.appendChild(sc);
      }
      if (s.seo_meta_pixel_id && !document.getElementById('fb-pixel')) {
        const sc = document.createElement('script');
        sc.id = 'fb-pixel';
        sc.setAttribute(MARK, '1');
        sc.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${s.seo_meta_pixel_id}');fbq('track','PageView');`;
        document.head.appendChild(sc);
      }

      if (s.seo_custom_head_code) injectRaw(s.seo_custom_head_code, document.head, 'data-seo-custom-head');
      if (s.seo_custom_body_code) injectRaw(s.seo_custom_body_code, document.body, 'data-seo-custom-body');
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
