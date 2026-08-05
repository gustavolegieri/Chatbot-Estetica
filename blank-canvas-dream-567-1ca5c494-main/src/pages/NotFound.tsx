import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-dark" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[120px]" />
        <div className="relative z-10 text-center px-4">
          <h1 className="font-serif text-8xl md:text-9xl text-gradient-gold mb-4">404</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Ops! Página não encontrada.
          </p>
          <Button variant="premium" size="lg" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-5 w-5" />
              Voltar ao Início
            </Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
