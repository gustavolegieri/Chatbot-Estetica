import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';

interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  created_at: string;
}

export default function Blog() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('blog_posts')
      .select('id,slug,title,excerpt,tags,cover_image_url,created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPosts((data as any) || []); setLoading(false); });
  }, []);

  return (
    <Layout>
      <Helmet>
        <title>Blog — EST ELITE</title>
        <meta name="description" content="Artigos sobre moda, estilo, coloração pessoal e consultoria de imagem." />
      </Helmet>
      <section className="container mx-auto px-4 py-20 max-w-5xl">
        <h1 className="font-serif text-4xl md:text-5xl mb-3 text-gradient-gold">Blog</h1>
        <p className="text-muted-foreground mb-12">Estilo, imagem pessoal e moda feminina.</p>
        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground">Em breve, novos conteúdos.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {posts.map((p) => (
              <Link key={p.id} to={`/blog/${p.slug}`} className="group glass-card rounded-xl p-6 hover:border-primary/40 border border-transparent transition">
                {p.cover_image_url && (
                  <img src={p.cover_image_url} alt={p.title} loading="lazy" className="w-full aspect-[16/9] object-cover rounded-lg mb-4" />
                )}
                <h2 className="font-serif text-xl mb-2 group-hover:text-primary transition">{p.title}</h2>
                {p.excerpt && <p className="text-sm text-muted-foreground line-clamp-3">{p.excerpt}</p>}
                <p className="text-xs text-muted-foreground mt-3">{new Date(p.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
