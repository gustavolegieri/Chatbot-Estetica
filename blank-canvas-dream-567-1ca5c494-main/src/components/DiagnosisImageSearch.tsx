// EST ELITE — Componente para exibir imagem baseada em diagnóstico
// Usa o hook useDiagnosisImageSearch para buscar imagens automaticamente
import React, { useEffect, useState } from 'react';
import { useDiagnosisImageSearch, DiagnosisImageSearchParams } from '@/hooks/useDiagnosisImageSearch';
import { Loader2 } from 'lucide-react';

interface DiagnosisImageSearchProps {
  params: DiagnosisImageSearchParams;
  onImageLoaded?: (imageUrl: string) => void;
  onError?: (error: string) => void;
  className?: string;
  fallback?: React.ReactNode;
  alt?: string;
}

export function DiagnosisImageSearch({
  params,
  onImageLoaded,
  onError,
  className = '',
  fallback,
  alt = 'Imagem de diagnóstico',
}: DiagnosisImageSearchProps) {
  const { searchImage, loading, error, result } = useDiagnosisImageSearch();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    // Buscar imagem quando params mudarem
    if (params.diagnosisId) {
      searchImage(params).then((searchResult) => {
        if (searchResult?.imageUrl) {
          setImageUrl(searchResult.imageUrl);
          onImageLoaded?.(searchResult.imageUrl);
        } else if (searchResult?.message) {
          onError?.(searchResult.message);
        }
      });
    }
  }, [params.diagnosisId, params.section, params.pieceName, params.category]);

  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !imageUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <span className="text-sm">Erro ao carregar imagem</span>
      </div>
    );
  }

  if (!imageUrl) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <span className="text-sm">Nenhuma imagem encontrada</span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onError={() => {
        setImageUrl(null);
        onError?.('Erro ao carregar imagem');
      }}
      onLoad={() => {
        if (onImageLoaded && imageUrl) {
          onImageLoaded(imageUrl);
        }
      }}
    />
  );
}

// Componente simplificado para imagens de seção específíficas
interface SectionImageProps {
  diagnosisId: string;
  section: string;
  questionnaire?: Record<string, unknown>;
  colorAnalysis?: Record<string, unknown>;
  styleAnalysis?: Record<string, unknown>;
  skinTone?: string;
  className?: string;
  onImageLoaded?: (imageUrl: string) => void;
}

export function SectionImage({
  diagnosisId,
  section,
  questionnaire,
  colorAnalysis,
  styleAnalysis,
  skinTone,
  className = '',
  onImageLoaded,
}: SectionImageProps) {
  return (
    <DiagnosisImageSearch
      params={{
        diagnosisId,
        section,
        questionnaire,
        colorAnalysis,
        styleAnalysis,
        skinTone,
        mode: 'editorial',
      }}
      className={className}
      onImageLoaded={onImageLoaded}
      alt={`Imagem da seção ${section}`}
    />
  );
}

// Componente para imagens de peças específicas
interface PieceImageProps {
  diagnosisId: string;
  pieceName: string;
  category?: string;
  questionnaire?: Record<string, unknown>;
  colorAnalysis?: Record<string, unknown>;
  styleAnalysis?: Record<string, unknown>;
  skinTone?: string;
  mode?: 'product' | 'editorial';
  className?: string;
  onImageLoaded?: (imageUrl: string) => void;
}

export function PieceImage({
  diagnosisId,
  pieceName,
  category,
  questionnaire,
  colorAnalysis,
  styleAnalysis,
  skinTone,
  mode = 'product',
  className = '',
  onImageLoaded,
}: PieceImageProps) {
  return (
    <DiagnosisImageSearch
      params={{
        diagnosisId,
        pieceName,
        category,
        questionnaire,
        colorAnalysis,
        styleAnalysis,
        skinTone,
        mode,
      }}
      className={className}
      onImageLoaded={onImageLoaded}
      alt={`Imagem da peça ${pieceName}`}
    />
  );
}