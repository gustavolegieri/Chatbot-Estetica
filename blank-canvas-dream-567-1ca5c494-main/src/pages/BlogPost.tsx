import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft } from 'lucide-react';

interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  cover_image_url: string | null;
  author: string | null;
  tags: string[] | null;
  created_at: string;
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    supabase.from('blog_posts').select('*').eq('slug', slug).eq('published', true).maybeSingle()
      .then(({ data }) => { setPost((data as any) || null); setLoading(false); });
  }, [slug]);

  if (loading) return <Layout><div className="container mx-auto px-4 py-20 text-muted-foreground">Carregando...</div></Layout>;
  if (!post) return <Layout><div className="container mx-auto px-4 py-20"><h1 className="font-serif text-3xl">Post não encontrado</h1><Link to="/blog" className="text-primary mt-4 inline-block">← Voltar ao blog</Link></div></Layout>;

  return (
    <Layout>
      <Helmet>
        <title>{post.meta_title || post.title}</title>
        {post.meta_description && <meta name="description" content={post.meta_description} />}
        <meta property="og:title" content={post.meta_title || post.title} />
        {post.meta_description && <meta property="og:description" content={post.meta_description} />}
        {post.cover_image_url && <meta property="og:image" content={post.cover_image_url} />}
        <meta property="og:type" content="article" />
        <link rel="canonical" href={`https://estelite.lovable.app/blog/${post.slug}`} />
      </Helmet>
      <article className="container mx-auto px-4 py-16 max-w-3xl">
        <Link to="/blog" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-8"><ArrowLeft className="h-4 w-4" />Todos os posts</Link>
        <h1 className="font-serif text-3xl md:text-5xl mb-4 text-gradient-gold">{post.title}</h1>
        <p className="text-sm text-muted-foreground mb-8">
          {post.author || 'EST ELITE'} · {new Date(post.created_at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {post.cover_image_url && <img src={post.cover_image_url} alt={post.title} className="w-full aspect-[16/9] object-cover rounded-xl mb-8" />}
        <div
          className="prose prose-invert max-w-none prose-headings:font-serif prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-border">
            {post.tags.map(t => <span key={t} className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground">#{t}</span>)}
          </div>
        )}
      </article>
    </Layout>
  );
}
