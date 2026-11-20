import SupplierSection from '../SupplierSection';

export default async function SupplierSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <SupplierSection section={section} />;
}
