import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  created_at: string;
}

export function HomeBlogSection() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    supabase.from('blog_posts')
      .select('id,slug,title,excerpt,cover_image_url,created_at')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => setPosts((data as any) || []));
  }, []);

  if (posts.length === 0) return null;

  return (
    <section aria-label="Blog" className="py-24 md:py-32 relative">
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl mb-4">
            Do nosso <span className="text-gradient-gold">blog</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Conteúdos sobre estilo, coloração pessoal e imagem feminina.</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {posts.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <Link to={`/blog/${p.slug}`} className="group glass-card rounded-xl p-6 block h-full border border-transparent hover:border-primary/40 transition">
                {p.cover_image_url && (
                  <img src={p.cover_image_url} alt={p.title} loading="lazy" className="w-full aspect-[16/9] object-cover rounded-lg mb-4" />
                )}
                <h3 className="font-serif text-lg mb-2 group-hover:text-primary transition line-clamp-2">{p.title}</h3>
                {p.excerpt && <p className="text-sm text-muted-foreground line-clamp-3">{p.excerpt}</p>}
                <p className="text-xs text-muted-foreground mt-3">{new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link to="/blog" className="inline-flex items-center gap-2 text-primary hover:underline">
            Ver todos os artigos <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
