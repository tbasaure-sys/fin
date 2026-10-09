import Link from 'next/link';
import { PublicSiteHeader } from '@/components/public-shell/public-site-header';
import CompanyThesisWorkspace from '@/components/company-thesis-workspace';
import { getCompanyReadingSnapshot } from '@/lib/company-reading/snapshots';
import { getCurrentCompanyReading } from '@/lib/server/company-reading-service';
import { companyReadingSnapshotStore } from '@/lib/server/company-reading-context';

export const dynamic = 'force-dynamic';
export function generateMetadata({ params }) { return { title: `${String(params.ticker).toUpperCase()} · Tesis refutable`, description: 'Negocio, expectativas implícitas, valoración, refutación y evidencia posterior sobre un snapshot trazable.' }; }
export default async function CompanyThesisPage({ params, searchParams }) {
  const ticker = String(params.ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 16);
  const missingDebt = searchParams?.case === 'missing-debt';
  const historical = ticker === 'MSFT' && (searchParams?.view === 'historical' || missingDebt);
  let snapshot;
  try { snapshot = historical ? getCompanyReadingSnapshot(ticker, { missingDebt }) : await getCurrentCompanyReading(ticker, { store: companyReadingSnapshotStore() }); }
  catch { snapshot = { ...getCompanyReadingSnapshot('UNCOVERED'), ticker, name: ticker, evidenceIssues: [{ key: 'storage', message: 'No se pudo capturar y conservar evidencia. Revisa la conexión y el almacenamiento persistente.' }] }; }
  return <div style={{ background: '#0b1119', minHeight: '100vh' }}>
    <PublicSiteHeader availableLanguages={['es']} initialLanguage="es" />
    <CompanyThesisWorkspace key={`${ticker}-${snapshot.id}-${missingDebt}`} snapshot={snapshot} missingDebt={missingDebt} />
    <footer style={{ padding: '24px', textAlign: 'center', color: '#a6b3c1', fontSize: '12px' }}><Link href="/aurora">AURORA</Link> · Software de investigación. Sin promesas de alfa, recomendaciones de operaciones ni ejecución.</footer>
  </div>;
}
