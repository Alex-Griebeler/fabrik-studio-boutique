import { Helmet } from "react-helmet-async";

const SITE_URL = "https://review-wizard-ry.lovable.app";
const SITE_NAME = "Fabrik — Body & Mind Fitness";
const OG_IMAGE = `${SITE_URL}/og-fabrik.jpg`;

interface SeoHeadProps {
  /** Título específico da rota, sem o sufixo da marca. */
  title: string;
  /** Meta description específica da rota (50–160 caracteres). */
  description: string;
  /** Caminho canônico da rota, iniciando com "/". */
  path: string;
  /** Rotas internas/autenticadas não devem ser indexadas. */
  noindex?: boolean;
}

/**
 * Metadados de <head> por rota. O index.html mantém as tags sitewide
 * (fallback para crawlers de preview social, que não executam JS).
 */
export function SeoHead({ title, description, path, noindex = false }: SeoHeadProps) {
  const fullTitle = `${title} — Fabrik`;
  const canonical = `${SITE_URL}${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={OG_IMAGE} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </Helmet>
  );
}
